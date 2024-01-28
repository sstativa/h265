# h265

Batch video converter for Codensity T408 Video Transcoder.

### Requirements
`ffmpeg` version 5.x compiled with --enable-libxcoder_logan --enable-ni_logan libraries.

### Usage

```
Usage:  [options] <src> <dst>

Options:
  -V, --version                  output the version number
  -m, --max-concurrent <number>  max concurrent (default: 2)
  -f, --ffmpeg <file>            path to ffmpeg (default: "ffmpeg")
  -u, --uid <uid>                UID (default: 501)
  -g, --gid <gid>                GID (default: 20)
  -h, --height <height>          scale to height (keep aspect ratio)
  -k, --keep                     keep original files
  -l, --log                      create log file
  --hw                           use h264_ni_locan_dec decoder instead of CPU decoder
  --vsync <mode>                 set video sync method [passthrough, cfr, vfr]
  --async                        enable async
  --fps <fps>                    set fps
  --aac                          convert audio stream to AAC
  --crf <crf>                    enable CRF
  --help                         display help for command
```

### Examples
`node main.js -m 2 -f /usr/local/bin/ffmpeg -h 720 -k -l --hw --vsync vfr --async --aac /mnt/usb/media /mnt/usb/converted/`

- 2 concurrent conversions, use `/usr/local/bin/ffmpeg`, scale to 720p, keep original files, create log file, use `h264_ni_locan_dec` decoder, set video sync method to `vfr`, enable async, convert audio stream to AAC, convert all files in `/mnt/usb/media` and save them to `/mnt/usb/converted/`.

`node main.js -m 1 -f /usr/local/bin/ffmpeg -k -l  --vsync vfr --async --aac /mnt/usb/media /mnt/usb/converted/`

- one by one conversion, use `/usr/local/bin/ffmpeg`, keep original files, create log file, use CPU decoder, set video sync method to `vfr`, enable async, convert audio stream to AAC, convert all files in `/mnt/usb/media` and save them to `/mnt/usb/converted/`.

`/script/h265 -m 1 -f /script/bin/v3.3.0/FFmpeg/ffmpeg -u $PUID -g $PGID --vsync vfr --keep /in /out`

/script/h265 -m 1 -f /script/bin/v3.3.0/FFmpeg/ffmpeg -u $PUID -g $PGID --vsync vfr --keep /in /out
### Notes
`uid` and `gid` are only useful if the script runs inside a Docker container.
