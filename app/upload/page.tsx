"use client";

import { useState } from "react";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState("");
  const [events, setEvents] = useState<any[]>([]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setStatus("");
    setPreview("");
    setEvents([]);
  }

  async function handleUploadClick() {
    if (!file) {
      setStatus("Please select a PDF syllabus.");
      return;
    }

    setStatus("Reading syllabus...");

    const formData = new FormData();
    formData.append("file", file);

    const endpoint = `${window.location.protocol}//${window.location.host}/api/upload`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.message || "Upload failed.");
        return;
      }

      const ev = Array.isArray(data.events) ? data.events : [];

      setStatus(data.message || "Done.");
      setPreview(data.preview || "");
      setEvents(ev);

      // ✅ Save events so the dashboard can use them
      localStorage.setItem("syllabus_events", JSON.stringify(ev));
    } catch (e: any) {
      setStatus(`Upload failed: ${String(e?.message || e)}`);
    }
  }

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1>Upload Your Syllabus</h1>

      <input type="file" accept=".pdf" onChange={handleFileChange} />

      {file && (
        <p style={{ marginTop: 10 }}>
          <strong>Selected:</strong> {file.name}
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        <button onClick={handleUploadClick}>Upload</button>
      </div>

      {status && <p style={{ marginTop: 15 }}>{status}</p>}

      <div style={{ marginTop: 10 }}>
        <a href="/dashboard">Go to Dashboard →</a>
      </div>

      {events.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <h3>Detected Deadlines</h3>
          <ul>
            {events.map((e, idx) => (
              <li key={idx} style={{ marginBottom: 8 }}>
                <strong>{e.due}</strong> — {e.title}{" "}
                <em style={{ opacity: 0.7 }}>({e.type})</em>
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <div style={{ marginTop: 30 }}>
          <h3>Extracted Text Preview</h3>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#f4f4f4",
              padding: 15,
              maxHeight: 300,
              overflow: "auto",
            }}
          >
            {preview}
          </pre>
        </div>
      )}
    </div>
  );
}
