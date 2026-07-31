import React from "react";
import ReactDOM from "react-dom/client";
// Self-hosted type — bundled into the build so it renders identically on desktop
// and phone, online or off. Geist for UI, Geist Mono for live readouts (one
// variable file each, so every weight is covered without extra requests).
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import App from "./App.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
