# h265

Batch video converter for Codensity T408 Video Transcoder.

## Usage

```
Usage: main [options] <src> <dst>

Options:
  -V, --version                  output the version number
  -m, --max-concurrent <number>  max concurrent (default: 2)
  -f, --ffmpeg <file>            path to ffmpeg (default: "ffmpeg")
  -u, --uid <uid>                UID (default: 501)
  -g, --gid <gid>                GID (default: 20)
  -k, --keep                     keep original files
  --sw                           use software decoder
  --vsync <mode>                 video sync method [passthrough, cfr, vfr] (default: "vfr")
  --async                        resync audio stream
  --crf <value>                  enable CRF
  -h, --help                     display help for command
  ```

### Notes

`ffmpeg` might be run as root, so `uid` and `gid` are used to set the correct owner of the file after conversion.
