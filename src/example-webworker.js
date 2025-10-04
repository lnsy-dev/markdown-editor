self.onmessage = (event) => {
  console.log("Message received in worker:", event.data);
  self.postMessage({ message: "Hello from the worker!" });
};