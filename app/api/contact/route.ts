import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // Handle both JSON and form-encoded submissions
    const contentType = req.headers.get("content-type") ?? "";
    let name: string, email: string, message: string;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      name = body.name; email = body.email; message = body.message;
    } else {
      const form = await req.formData();
      name = form.get("name") as string;
      email = form.get("email") as string;
      message = form.get("message") as string;
    }

    if (!name || !email || !message) {
      return NextResponse.redirect(new URL("/design.html?error=1", req.url));
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Demand Pilot Website <alex@demandpilot.co.uk>",
        to: ["pryeralex492@gmail.com"],
        reply_to: email,
        subject: `Website enquiry from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      }),
    });

    if (!res.ok) {
      return NextResponse.redirect(new URL("/design.html?error=1", req.url));
    }

    return NextResponse.redirect(new URL("/design.html?sent=1", req.url));
  } catch (e: any) {
    return NextResponse.redirect(new URL("/design.html?error=1", req.url));
  }
}
