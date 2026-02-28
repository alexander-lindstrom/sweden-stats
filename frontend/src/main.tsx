import React from "react";
import ReactDOM from "react-dom/client";

// OL reads canvas pixels for hit detection via getImageData(). Without this
// flag each read triggers a GPU→CPU transfer. Patch before anything renders.
{
  const orig = HTMLCanvasElement.prototype.getContext;
  // @ts-expect-error — overriding overloaded native
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    return orig.call(this, type, type === '2d' ? { ...attrs, willReadFrequently: true } : attrs);
  };
}
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import App from "./App";
import "./index.css";
import { store } from "./app/store";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
