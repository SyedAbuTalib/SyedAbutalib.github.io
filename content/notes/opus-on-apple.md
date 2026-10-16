---
title: "Lack of Opus support on macOS"
publishDate: "2026-10-15T23:45:00-07:00"
---

Sad fact of the day: Safari on macOS still does not support Opus in `.mp4` files.

You can test this in the browser's developer console:

```js
// streaming (Media Source Extensions)
MediaSource.isTypeSupported('audio/mp4; codecs="opus"');

// regular <audio>/<video> playback
document.createElement("audio").canPlayType('audio/mp4; codecs="opus"');
```

Chrome and Firefox say yes to both. Safari returns `false` for the first and `""` (meaning "no") for the second.
