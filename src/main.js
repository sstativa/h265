const fs = require('fs');
const mv = require('mv');
const path = require('path');
const program = require('commander');
const Queue = require('promise-queue');
const { spawn } = require('child_process');

let srcDirectory;
let dstDirectory;
let options;

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

function getFiles(dir, parent = '') {
  const files = [];

  try {
    fs.readdirSync(dir).forEach((f) => {
      // f - file (might be a directory)
      // p - absolute path
      const p = path.join(dir, f);

      const stats = fs.statSync(p);

      if (stats.isDirectory()) {
        files.push(...getFiles(p, path.join(parent, f)));
      } else if (stats.isFile() && p.match(/\.(mp4|mkv)$/)) {
        files.push(path.join(parent, f));
      }
    });
  } catch (err) {
    console.error(err);
  }

  return files;
}

function convertFile(file, idx) {
  return new Promise((resolve) => {
    const start = Date.now();

    console.log('Starting ', file);

    const srcFile = path.join(srcDirectory, file);

    const { dir, name } = path.parse(file);

    const dstDir = path.join(dstDirectory, dir);

    mkdir(dstDir, options.uid, options.gid);

    const tmpFile = path.join(dstDir, `~${name}.h265.mp4`);
    const logFile = path.join(dstDir, `${name}.log`);

    const args = ['-y', '-hide_banner'];

    if (!options.sw) {
      args.push('-c:v', 'h264_ni_dec');
    }

    args.push('-i', srcFile);

    args.push('-c:v', 'h265_ni_enc');

    // ffmpeg 5: use -fps_mode
    // ffmpeg 4: use -vsync
    // switch (options.vsync) {
    //   case 'passthrough': args.push('-fps_mode', 'passthrough'); break;
    //   case 'cfr': args.push('-fps_mode', 'cfr'); break;
    //   case 'drop': args.push('-fps_mode', 'drop'); break;
    //   default: args.push('-fps_mode', 'vfr');
    // }

    switch (options.vsync) {
      case 'passthrough': args.push('-vsync', 'passthrough'); break;
      case 'cfr': args.push('-vsync', 'cfr'); break;
      case 'drop': args.push('-vsync', 'drop'); break;
      default: args.push('-vsync', 'vfr');
    }

    if (options.async) {
      args.push('-c:a', 'aac', '-af', 'aresample=async=1');
    } else {
      args.push('-c:a', 'copy');
    }

    if (options.crf) {
      args.push('-xcoder-params', `crf=${options.crf}`);
    }

    args.push('-movflags', 'faststart', '-flags', '+global_header', '-tag:v', 'hvc1', tmpFile);

    console.log(options.ffmpeg, ...args);

    let log = '';

    const ffmpeg = spawn(options.ffmpeg, args);

    ffmpeg.stderr.on('data', (data) => {
      log += data.toString();
    });

    ffmpeg.stdout.on('data', (data) => {
      log += data.toString();
    });

    ffmpeg.on('close', () => {
      try {
        fs.writeFileSync(logFile, log.replaceAll('\r', '\n'), 'utf8');
        fs.chownSync(logFile, options.uid, options.gid);

        const srcStats = fs.statSync(srcFile);
        const tmpStats = fs.statSync(tmpFile);

        const ratio = Math.ceil((tmpStats.size / srcStats.size) * 100);

        const dstFile = path.join(dstDir, `${name}.${ratio}%.h265.mp4`);

        fs.renameSync(tmpFile, dstFile);
        fs.chownSync(dstFile, options.uid, options.gid);

        if (options.keep) {
          mv(srcFile, path.join(dstDir, `${name}.bak`), (err) => {
            if (err) {
              console.log(err);
            } else {
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
  const start = Date.now();

  srcDirectory = path.resolve(src);
  dstDirectory = path.resolve(dst);
  options = program.opts();

  const files = getFiles(srcDirectory);

  console.log('%d files to convert [uid: %d, gid: %d]', files.length, options.uid, options.gid);

  await convertFiles(files);

  console.log('Done in %d seconds', (Date.now() - start) / 1000);
}

program
  .version('1.0.0')
  .arguments('<src> <dst>')
  .option('-m, --max-concurrent <number>', 'max concurrent', Number, 2)
  .option('-f, --ffmpeg <file>', 'path to ffmpeg', 'ffmpeg')
  .option('-u, --uid <uid>', 'UID', Number, process.getuid())
  .option('-g, --gid <gid>', 'GID', Number, process.getgid())
  .option('-k, --keep', 'keep original files')
  .option('--sw', 'use software decoder')
  .option('--vsync <mode>', 'video sync method [passthrough, cfr, vfr]', 'vfr')
  .option('--async', 'resync audio stream')
  .option('--crf <value>', 'enable CRF', Number)
  .action(action)
  .parse(process.argv);
