let mediaRecorder;
let recordedBlobs;
let hFlip = false;

async function startRecording() {
  const video = document.getElementById('video');

  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  const [track] = stream.getVideoTracks();

  const processor = new MediaStreamTrackProcessor(track);
  const generator = new MediaStreamTrackGenerator('video');
  const source = processor.readable;
  const sink = generator.writable;

  const transformer = new TransformStream({
    async transform(videoFrame, controller) {
      const flippedFrame = new VideoFrame(videoFrame, {
        timestamp: videoFrame.timestamp,
        visibleRect: videoFrame.visibleRect,
        displayWidth: videoFrame.displayWidth,
        displayHeight: videoFrame.displayHeight,
        // rotation: 'none',
        flip: hFlip // This will flip the video frame
      });
      // console.log(flippedFrame);
      controller.enqueue(flippedFrame);
      videoFrame.close();
    }
  });

  source.pipeThrough(transformer).pipeTo(sink);

  const processedStream = new MediaStream([generator]);
  video.srcObject = processedStream;

  recordedBlobs = [];
  mediaRecorder = new MediaRecorder(processedStream, { mimeType: 'video/mp4; codecs="vp9, opus"' });


  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedBlobs.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedBlobs, { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PLEASE.mp4';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
  }

  mediaRecorder.start();

  document.getElementById('stopRecording').disabled = false;
  document.getElementById('startRecording').disabled = true;
  document.getElementById('flip').disabled = false;
}

function stopRecording() {
  mediaRecorder.stop();
  const video = document.getElementById('video');
  const tracks = video.srcObject.getTracks();
  tracks.forEach(track => track.stop());
  
  video.srcObject = null;

  document.getElementById('stopRecording').disabled = true;
  document.getElementById('startRecording').disabled = false;
  document.getElementById('flip').disabled = true;
}

function flip() {
  console.log('flip ran');
  hFlip = !hFlip;
}
// Add a start recording button

document.getElementById('startRecording').addEventListener('click', startRecording);
document.getElementById('stopRecording').addEventListener('click', stopRecording);
document.getElementById('flip').addEventListener('click', flip);
