export const loadAudioFile = (ctx, file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => ctx.decodeAudioData(e.target.result, resolve);
  reader.readAsArrayBuffer(file);
});

export const downloadBlob = async (blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  document.body.appendChild(a);
  a.style = "display: none";
  a.href = url;
  a.download = "download.wav";
  a.click();
  window.URL.revokeObjectURL(url);
};
