import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import pdf from "pdf-parse";

// Ensure this runs in Node (pdf-parse needs Node runtime)
export const runtime = "nodejs";

function extractEventsFromText(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const mdNumeric = /\b(0?[1-9]|1[0-2])[\/\-.](0?[1-9]|[12]\d|3[01])\b/;
  const mdWords =
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(0?[1-9]|[12]\d|3[01])\b/i;

  const typeKeywords = [
    { type: "exam", re: /\b(exam|midterm|final)\b/i },
    { type: "quiz", re: /\b(quiz)\b/i },
    { type: "assignment", re: /\b(homework|hw|assignment|paper|essay)\b/i },
    { type: "project", re: /\b(project|presentation|proposal)\b/i },
    { type: "reading", re: /\b(reading|chapter|ch\.)\b/i },
  ];

  const events: { title: string; type: string; due: string; sourceLine: string }[] = [];

  for (const line of lines) {
    const hasType = typeKeywords.some((k) => k.re.test(line));
    if (!hasType) continue;

    const m1 = line.match(mdNumeric);
    const m2 = line.match(mdWords);
    const due = (m2?.[0] ?? m1?.[0] ?? "").trim();
    if (!due) continue;

    let title = line
      .replace(/\b(due|deadline)\b\s*[:\-]?\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (title.length > 140) title = title.slice(0, 140) + "…";

    const type = typeKeywords.find((k) => k.re.test(line))?.type ?? "other";
    events.push({ title, type, due, sourceLine: line });
  }

  const seen = new Set<string>();
  const unique = events.filter((e) => {
    const key = `${e.title}__${e.due}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => a.due.localeCompare(b.due));
  return unique.slice(0, 60);
}

export async function POST(req: Request) {
  try {
    // ✅ Require login
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();

    if (!userData?.user) {
      return NextResponse.json({ message: "Please log in first at /login." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ message: "No file received." }, { status: 400 });
    }

    const safeName = (file.name || "syllabus.pdf").replace(/[^\w.\-]/g, "_");

    // Read file into Buffer (works in Vercel Node runtime)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text (no external binaries)
    let text = "";
    if (file.type === "application/pdf" || safeName.toLowerCase().endsWith(".pdf")) {
      const parsed = await pdf(buffer);
      text = parsed.text || "";
    } else {
      // Optional: allow .txt uploads too
      text = buffer.toString("utf8");
    }

    if (!text.trim() || text.trim().length < 50) {
      return NextResponse.json(
        { message: "Couldn’t read text from this file. If it’s a scanned PDF (image-only), try a selectable-text PDF." },
        { status: 400 }
      );
    }

    const events = extractEventsFromText(text);

    // ✅ Save to Supabase DB
    const user_id = userData.user.id;

    const { data: syllabusRow, error: syllabusErr } = await supabase
      .from("syllabi")
      .insert([{ user_id, filename: safeName }])
      .select()
      .single();

    if (syllabusErr) {
      console.error("SYLLABUS INSERT ERROR:", syllabusErr);
      return NextResponse.json({ message: syllabusErr.message }, { status: 500 });
    }

    if (events.length > 0) {
      const rows = events.map((e) => ({
        user_id,
        syllabus_id: syllabusRow.id,
        title: e.title,
        type: e.type,
        due_text: e.due,
      }));

      const { error: eventsErr } = await supabase.from("events").insert(rows);
      if (eventsErr) {
        console.error("EVENTS INSERT ERROR:", eventsErr);
        return NextResponse.json({ message: eventsErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      message: `Saved! Found ${events.length} deadlines.`,
      preview: text.slice(0, 1500),
      events,
    });
  } catch (err: any) {
    console.error("UPLOAD ROUTE ERROR:", err);
    return NextResponse.json(
      { message: `Server error: ${err?.message || String(err)}` },
      { status: 500 }
    );
  }
}