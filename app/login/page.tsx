"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  async function signIn() {
    setMsg("Sending link...");
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // IMPORTANT: send them back through the callback route
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setMsg(error ? error.message : "Check your email for the sign-in link.");
  }

  return (
    <div style={{ padding: 40, maxWidth: 520 }}>
      <h1>Log in</h1>
      <p>Enter your email and we’ll send you a sign-in link.</p>

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@school.edu"
        style={{ padding: 10, width: "100%", marginTop: 10 }}
      />

      <button onClick={signIn} style={{ marginTop: 12 }}>
        Send link
      </button>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <p style={{ marginTop: 20, opacity: 0.8 }}>
        After you click the link in your email, you’ll land on the Dashboard.
      </p>
    </div>
  );
}
