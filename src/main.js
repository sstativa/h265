/* eslint-disable no-promise-executor-return */
/* eslint-disable no-await-in-loop */

const fs = require('fs');
const mv = require('mv');
const path = require('path');
const program = require('commander');
const Queue = require('promise-queue');
const { spawn } = require('child_process');

let srcDirectory;
let dstDirectory;
let options;

const sleep = (sec, fn) => new Promise((resolve) => setTimeout(() => resolve(fn), sec * 1000));

function mkdir(dir, uid, gid) {
  let first = fs.mkdirSync(dir, { recursive: true });

  if (first) {
    const parts = dir.slice(first.length).split(path.sep);

    do {
      first = path.join(first, parts.shift());

      fs.chownSync(first, uid, gid);
    } while (parts.length);
  }
}

function getFiles(dir, parentDir = '') {
  const files = [];

  try {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((dirent) => {
      const rp = path.join(parentDir, dirent.name); // relative path

      if (dirent.isDirectory()) {
        files.push(...getFiles(path.join(dir, dirent.name), rp));
      } else if (dirent.isFile() && dirent.name.match(/\.(mp4|mkv|webm)$/)) {
        files.push(rp);
      }
    });
  } catch (err) {
    console.error(err);
  }

  return files;
}

function getCodec(file) {
  return new Promise((resolve) => {
    const output = [];

    const args = ['-y', '-hide_banner', '-i', file];

    const ffmpeg = spawn(options.ffmpeg, args);

    ffmpeg.stderr.on('data', (data) => {
      output.push(data.toString());
    });

    ffmpeg.stdout.on('data', (data) => {
      output.push(data.toString());
    });

    ffmpeg.on('close', () => {
      try {
        const match = output.join('').match(/Stream.*Video: ([^ ]*) /);

        resolve(match ? match[1] : null);
      } catch (err) {
        resolve(null);
      }
    });
  }).catch(console.error);
}

async function convertFile(file, idx) {
  const start = Date.now();

  const srcFile = path.join(srcDirectory, file);

  try {
    const stats = fs.statSync(srcFile);

    // skip the file if it was changed recently
    if ((Date.now() - stats.ctimeMs) < 90000) {
      return Promise.resolve(); // make eslint happy
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(err);
    }

    return Promise.resolve(); // skip the file
  }

  const codec = (options.hw) ? await getCodec(srcFile) : null;

  return new Promise((resolve) => {
    const { dir, name } = path.parse(file);

    const dstDir = path.join(dstDirectory, dir);

    const tmpFile = path.join(dstDir, `~${name}.h265.tmp`);

    mkdir(dstDir, options.uid, options.gid);

    const args = ['-y', '-hide_banner'];

    if (codec === 'h264') {
      args.push('-c:v', 'h264_ni_logan_dec');
    }

    args.push('-i', srcFile);
    args.push('-c:v', 'h265_ni_logan_enc');

    const vf = [];

    if (options.height) {
      vf.push(`scale=-1:${options.height}`);
    }

    if (options.fps) {
      vf.push(`fps=${options.fps}`);
    }

    if (vf.length > 0) {
      args.push('-vf', vf.join(','));
    }

    switch (options.vsync) {
      case 'passthrough': args.push('-fps_mode', 'passthrough'); break;
      case 'cfr': args.push('-fps_mode', 'cfr'); break;
      case 'vfr': args.push('-fps_mode', 'vfr'); break;
      case 'drop': args.push('-fps_mode', 'drop'); break;
      default:
        // do nothing
    }

    // args.push('-video_track_timescale', '90k');

    if (options.async) {
      args.push('-c:a', 'aac', '-af', 'aresample=async=1');
    } else if (options.aac) {
      args.push('-c:a', 'aac');
    } else {
      args.push('-c:a', 'copy');
    }

    if (options.crf) {
      args.push('-xcoder-params', `crf=${options.crf}`);
    }

    args.push('-movflags', 'faststart', '-flags', '+global_header', '-tag:v', 'hvc1', '-f', 'mp4', tmpFile);

    const output = [];

    const ffmpeg = spawn(options.ffmpeg, args);

    const onData = (data) => {
      const text = data.toString();

      output.push(text);

      if (options.maxConcurrent === 1) {
        process.stdout.write(text);
      }
    };

    ffmpeg.stderr.on('data', onData);

    ffmpeg.stdout.on('data', onData);

    ffmpeg.on('close', (code) => {
      if (code) {
        console.log('%s failed', file);

        try {
          const outputFile = path.join(srcDirectory, dir, `${name}.log`);

          fs.writeFileSync(outputFile, output.join(''), 'utf8');

          fs.chownSync(outputFile, options.uid, options.gid);
        } catch (err) {
          console.error(err);
        }

        return;
      }

      try {
        if (options.log) {
          const logFile = path.join(dstDir, `${name}.log`);

          fs.writeFileSync(logFile, output.join(''), 'utf8');

          fs.chownSync(logFile, options.uid, options.gid);
        }

        const srcStats = fs.statSync(srcFile);
        const tmpStats = fs.statSync(tmpFile);

        const ratio = (tmpStats.size / srcStats.size) * 100;

        const dstFile = path.join(dstDir, `${name}.${Math.ceil(ratio)}%.h265.mp4`);

        fs.renameSync(tmpFile, dstFile);

        fs.chownSync(dstFile, options.uid, options.gid);

        // remember "modification time" of original file
        const mtime = Math.ceil(srcStats.mtime.getTime() / 1000);

        fs.utimesSync(dstFile, mtime, mtime);

        if (options.keep) {
          const bakFile = path.join(dstDir, `${name}.bak`);

          mv(srcFile, bakFile, (err) => {
            if (err) {
              console.error(err);
            } else {
              fs.chownSync(bakFile, options.uid, options.gid);

              console.log('%s done in %d seconds (#%d)', file, (Date.now() - start) / 1000, idx);
            }

            resolve();
          });
        } else {
          fs.rmSync(srcFile);

          console.log('%s done in %d seconds (#%d)', file, (Date.now() - start) / 1000, idx);

          resolve();
        }
      } catch (err) {
        console.error(err);

        resolve();
      }
    });
  }).catch(console.error);
}

function convertFiles(files) {
  return new Promise((resolve) => {
    const queue = new Queue(options.maxConcurrent, Infinity);

    files.forEach((file, idx) => {
      queue
        .add(() => convertFile(file, idx))
        .catch(console.error)
        .finally(() => {
          if ((queue.getPendingLength() + queue.getQueueLength()) === 0) {
            resolve();
          }
        });
    });
  });
}

async function action(src, dst) {
  srcDirectory = path.resolve(src);
  dstDirectory = path.resolve(dst);

  options = program.opts();

  for (;;) {
    const start = Date.now();

    const files = getFiles(srcDirectory);

    if (!files.length) {
      process.exit(0); // nothing to convert
    }

    console.log('%d files to convert [UID: %d, GID: %d]', files.length, options.uid, options.gid);

    await convertFiles(files);

    console.log('Done in %d seconds', (Date.now() - start) / 1000);

    await sleep(90); // sleep for 90 seconds
  }
}

program
  .version('1.1.0')
  .arguments('<src> <dst>')
  .option('-m, --max-concurrent <number>', 'max concurrent', Number, 2)
  .option('-f, --ffmpeg <file>', 'path to ffmpeg', 'ffmpeg')
  .option('-u, --uid <uid>', 'UID', Number, process.getuid())
  .option('-g, --gid <gid>', 'GID', Number, process.getgid())
  .option('-h, --height <height>', 'scale to height and keep aspect ratio', Number)
  .option('-k, --keep', 'keep original files')
  .option('-l, --log', 'create log file')
  .option('--hw', 'use h264_ni_locan_dec decoder instead of CPU decoder')
  .option('--vsync <mode>', 'set video sync method [passthrough, cfr, vfr]')
  .option('--async', 'enable async')
  .option('--fps <fps>', 'set fps', Number)
  .option('--aac', 'convert audio stream to AAC')
  .option('--crf <crf>', 'enable CRF', Number);

if (!process.argv.slice(2).length) {
  program.outputHelp();
} else {
  program.parse(process.argv).action(action);
}
