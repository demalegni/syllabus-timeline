"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type EventItem = {
  title: string;
  type: string;
  due_text: string;
  created_at?: string;
  // If you have this column in your table, keep it (optional)
  user_id?: string;
};

function parseDueToDate(due: string) {
  const s = (due || "").trim();
  if (!s) return null;

  const monthMap: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  const wordMatch = s.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(0?[1-9]|[12]\d|3[01])\b/i
  );
  if (wordMatch) {
    const mon = wordMatch[1].toLowerCase().replace(".", "");
    const day = Number(wordMatch[2]);
    const year = new Date().getFullYear();
    return new Date(year, monthMap[mon], day, 23, 59, 0, 0);
  }

  const numMatch = s.match(/\b(0?[1-9]|1[0-2])[\/\-.](0?[1-9]|[12]\d|3[01])\b/);
  if (numMatch) {
    const month = Number(numMatch[1]) - 1;
    const day = Number(numMatch[2]);
    const year = new Date().getFullYear();
    return new Date(year, month, day, 23, 59, 0, 0);
  }

  return null;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(x, mondayOffset);
}
function endOfWeek(d: Date) {
  return endOfDay(addDays(startOfWeek(d), 6));
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export default function DashboardPage() {
  const router = useRouter();

  const [view, setView] = useState<"tomorrow" | "week" | "month" | "all">("week");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "exam" | "quiz" | "assignment" | "project" | "reading" | "other"
  >("all");

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");

      const supabase = createClient();

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        if (!cancelled) {
          setError(authErr.message);
          setLoading(false);
        }
        return;
      }

      if (!auth?.user) {
        // Auto-send to login if not authenticated
        router.replace("/login");
        return;
      }

      if (!cancelled) {
        setUserEmail(auth.user.email ?? "Logged in");
      }

      // --- Fetch events ---
      // If your table already has user_id + RLS, you can keep it as-is.
      // If you DEFINITELY have a user_id column, you can enable the .eq("user_id", auth.user.id) line.
      let q = supabase
        .from("events")
        .select("title,type,due_text,created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      // OPTIONAL (only if your events table has user_id):
      // q = q.eq("user_id", auth.user.id);

      const { data, error } = await q;

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setEvents([]);
      } else {
        setEvents(((data as any[]) || []) as EventItem[]);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const now = new Date();

  const windowRange = useMemo(() => {
    if (view === "tomorrow") {
      const t = addDays(now, 1);
      return { start: startOfDay(t), end: endOfDay(t), label: "Due Tomorrow" };
    }
    if (view === "week") {
      return { start: startOfWeek(now), end: endOfWeek(now), label: "Due This Week" };
    }
    if (view === "month") {
      return { start: startOfMonth(now), end: endOfMonth(now), label: "Due This Month" };
    }
    return {
      start: startOfDay(now),
      end: new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59, 999),
      label: "All Upcoming",
    };
  }, [view, now]);

  const filtered = useMemo(() => {
    const withDates = events
      .map((e) => ({
        ...e,
        dueDate: parseDueToDate(e.due_text),
      }))
      .filter((e) => e.dueDate) as any[];

    let inRange = withDates.filter((e) => {
      const dt = e.dueDate as Date;
      return dt >= windowRange.start && dt <= windowRange.end;
    });

    if (typeFilter !== "all") {
      inRange = inRange.filter((e) => (e.type || "other") === typeFilter);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      inRange = inRange.filter((e) => {
        const t = (e.title || "").toLowerCase();
        const due = (e.due_text || "").toLowerCase();
        const type = (e.type || "").toLowerCase();
        return t.includes(q) || due.includes(q) || type.includes(q);
      });
    }

    inRange.sort((a, b) => (a.dueDate as Date).getTime() - (b.dueDate as Date).getTime());
    return inRange;
  }, [events, windowRange, query, typeFilter]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div style={{ padding: 40, maxWidth: 980 }}>
      <h1>Dashboard</h1>

      {!userEmail ? (
        <p>
          You’re not logged in. Go to <a href="/login">/login</a>.
        </p>
      ) : (
        <p style={{ opacity: 0.8 }}>
          Logged in as <strong>{userEmail}</strong> — <button onClick={logout}>Log out</button>
        </p>
      )}

      <p style={{ marginTop: 6, opacity: 0.8 }}>
        {windowRange.label}: {windowRange.start.toDateString()} → {windowRange.end.toDateString()}
      </p>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setView("tomorrow")}>Tomorrow</button>
        <button onClick={() => setView("week")}>This Week</button>
        <button onClick={() => setView("month")}>This Month</button>
        <button onClick={() => setView("all")}>All Upcoming</button>

        <a href="/upload" style={{ alignSelf: "center", marginLeft: "auto" }}>
          Upload another syllabus →
        </a>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search: exam, quiz, paper..."
          style={{ padding: 8, minWidth: 280 }}
        />

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} style={{ padding: 8 }}>
          <option value="all">All types</option>
          <option value="exam">Exam</option>
          <option value="quiz">Quiz</option>
          <option value="assignment">Assignment</option>
          <option value="project">Project</option>
          <option value="reading">Reading</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div style={{ marginTop: 25 }}>
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p style={{ color: "crimson" }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p>No deadlines found for this view.</p>
        ) : (
          <ul>
            {filtered.map((e: any, idx: number) => (
              <li key={idx} style={{ marginBottom: 10 }}>
                <strong>{(e.dueDate as Date).toLocaleString()}</strong> — {e.title}{" "}
                <em style={{ opacity: 0.7 }}>({e.type || "other"})</em>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
