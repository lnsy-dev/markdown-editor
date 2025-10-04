# Dataroom.js

`Dataroom.js` provides a powerful and flexible custom element, `DataroomElement`, that serves as a foundation for creating interactive data visualization components. This document details its features and provides examples of how to extend and utilize them.

## Installation

```bash
npm install dataroom-js --save
```

or you can import via CDN:

```js
import DataroomElement from "https://unpkg.com/dataroom-js@0.7.5/src/index.js";
```

## Basic Usage

To use `DataroomElement`, you can either use it directly in your HTML or extend it to create your own custom components.

### Extending `DataroomElement`

```javascript
import DataroomElement from 'dataroom-js';

class MyComponent extends DataroomElement {
  async initialize() {
    // Your initialization logic here
  }
}

customElements.define('my-component', MyComponent);
```

## Features

### `create(type, attributes, target_el)`

Creates a new HTML element and appends it to the component or a specified target.

**Example:**

```javascript
class MyComponent extends DataroomElement {
  async initialize() {
    const container = this.create('div', { class: 'container' });
    this.create('p', { content: 'Hello, World!' }, container);
  }
}
```

### `event(name, detail)`

Emits a custom event from the component.

**Example:**

```javascript
class MyComponent extends DataroomElement {
  async initialize() {
    this.event('my-event', { foo: 'bar' });
  }
}

const myComponent = document.querySelector('my-component');
myComponent.addEventListener('my-event', (e) => {
  console.log(e.detail); // { foo: 'bar' }
});
```

### `on(name, cb)` and `once(name, cb)`

Attaches an event listener to the component. `once` is a variant that fires the listener only one time.

**`on` Example:**

```javascript
class MyComponent extends DataroomElement {
  async initialize() {
    this.on('my-event', (detail) => {
      console.log('This will be logged every time:', detail);
    });

    this.event('my-event', { foo: 'bar' });
    this.event('my-event', { foo: 'baz' });
  }
}
```

**`once` Example:**

```javascript
class MyComponent extends DataroomElement {
  async initialize() {
    this.once('one-time-event', (detail) => {
      console.log('This will only be logged once:', detail);
    });

    // Firing the event multiple times
    this.event('one-time-event', { attempt: 1 });
    this.event('one-time-event', { attempt: 2 });
  }
}
```

### `call(endpoint, body)`

A helper for making `fetch` requests. It includes features for handling different security schemes and request timeouts.

#### `security-scheme` Attribute

Determines the authentication method:

*   `localstorage`: (Default) Sends a bearer token from `localStorage`.
*   `cookie`: Relies on the browser to send cookies automatically.

**Example:**

```html
<my-component security-scheme="localstorage"></my-component>
```

```javascript
// In your component
const data = await this.call('/api/data');
```

#### `call-timeout` Attribute

Sets a timeout for the request in milliseconds.

**Example:**

```html
<my-component call-timeout="5000"></my-component>
```

### `getJSON(url)`

Fetches a JSON file from a URL, parses it, and returns it as a JavaScript object. It includes robust error handling for network issues, bad HTTP statuses, and JSON parsing errors.

**Example:**

```javascript
class JsonComponent extends DataroomElement {
  async initialize() {
    try {
      // Public APIs are great for examples
      const data = await this.getJSON('https://jsonplaceholder.typicode.com/users/1');
      this.log(`Fetched user: ${data.name}`);
      this.innerHTML = `Hello, ${data.name}!`;
    } catch (error) {
      console.error(error);
      this.innerHTML = `Failed to fetch data: ${error.message}`;
    }
  }
}
```

### `log(message)`

Logs a message to the console if the `verbose` attribute is set.

**Example:**

```html
<my-component verbose="true"></my-component>
```

```javascript
class MyComponent extends DataroomElement {
  async initialize() {
    this.log('Initializing component...');
  }
}
```

### Lifecycle Methods

`DataroomElement` provides several lifecycle methods that you can override to control the component's behavior.

*   `initialize()`: Called after the component is connected to the DOM and its attributes are available.
*   `disconnect()`: Called when the component is removed from the DOM.

**Example:**

```javascript
class MyComponent extends DataroomElement {
  async initialize() {
    console.log('Component initialized!');
  }

  async disconnect() {
    console.log('Component disconnected!');
  }
}
```

### Attribute Observation

`DataroomElement` automatically observes attribute changes and fires a `NODE-CHANGED` event.

**Example:**

```javascript
class MyComponent extends DataroomElement {
  async initialize() {
    this.on('NODE-CHANGED', (detail) => {
      console.log(detail.attribute, detail.newValue);
    });
  }
}

const myComponent = document.querySelector('my-component');
myComponent.setAttribute('foo', 'bar'); // Logs: foo bar
```