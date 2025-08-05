// src/components/Splashscreen.jsx
import React, { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const Splashscreen = () => {
  useEffect(() => {
    const initializeApp = async () => {
      // Simulate your app initialization
      console.log("Initializing app...");

      // Perform your heavy setup tasks here
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Notify Rust that frontend setup is complete
      await invoke("complete_setup");
    };

    initializeApp();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "linear-gradient(45deg, #1e3c72, #2a5298)",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>Your App Name</h1>
      <div style={{ marginTop: "20px" }}>
        <div
          className="spinner"
          style={{
            border: "4px solid rgba(255,255,255,0.3)",
            borderTop: "4px solid white",
            borderRadius: "50%",
            width: "40px",
            height: "40px",
            animation: "spin 1s linear infinite",
          }}
        ></div>
      </div>
      <p style={{ marginTop: "20px" }}>Loading...</p>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Splashscreen;
