import DataroomElement from 'dataroom-js';

class ExampleComponent extends DataroomElement {
  async initialize(){
    this.create("h1", {content: "Example Code"});
    const p = this.create("p", {content: "This element uses the dataroom.js. It provides a few features that make using custom HTML Elements easier!"})
    this.create("a", {
      content: "Check it out here!", 
      href:"https://dataroom-network.github.io/dataroom.js/"}
    );

    const worker = new Worker(new URL('./example-webworker.js', import.meta.url));

    worker.onmessage = (event) => {
      console.log("Message received from worker:", event.data);
      this.create("p", {content: JSON.stringify(event.data)});
    };

    worker.postMessage({ message: "Hello from the main thread!" });
  }
}

customElements.define('example-component', ExampleComponent)
