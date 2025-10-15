import crypto from "crypto";
import admin from "firebase-admin";

// --- Inicializa Firebase Admin (evita múltiplas inits em ambiente serverless) ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const auth = admin.auth();
const db = admin.firestore();

// --- Função principal da rota ---
export async function POST(req) {
  try {
    const body = await req.json();
    const event = body?.event;
    const email = body?.data?.customer?.email;
    const name = body?.data?.customer?.name || "Cliente BrazHits";

    // Ignora eventos não relevantes
    if (event !== "purchase_approved") {
      return new Response(JSON.stringify({ msg: "Evento ignorado" }), { status: 200 });
    }

    if (!email) {
      return new Response(JSON.stringify({ error: "Email ausente" }), { status: 400 });
    }

    // Verifica se já existe usuário
    let existing = null;
    try {
      existing = await auth.getUserByEmail(email);
    } catch {}

    if (existing) {
      return new Response(JSON.stringify({ msg: "Usuário já existe" }), { status: 200 });
    }

    // Gera senha aleatória
    const randomPassword = crypto.randomBytes(6).toString("base64").slice(0, 10);

    // Cria usuário no Firebase
    const user = await auth.createUser({
      email,
      password: randomPassword,
      displayName: name,
      emailVerified: true,
    });

    // Registra no Firestore
    await db.collection("users").doc(user.uid).set({
      email,
      name,
      createdAt: Date.now(),
      origin: "vega-checkout",
    });

    // Envia e-mail (webhook externo)
    if (process.env.MAIL_WEBHOOK_URL) {
      await fetch(process.env.MAIL_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: "Seus dados de acesso - Packs BrazHits 🎵",
          html: `
            <h2>Olá ${name.split(" ")[0]}!</h2>
            <p>Seu acesso à <b>Área de Membros BrazHits</b> foi liberado com sucesso.</p>
            <p><b>Email:</b> ${email}<br><b>Senha:</b> ${randomPassword}</p>
            <a href="https://brazhits.com.br/login" 
               style="display:inline-block;background:#00E4FF;color:#001A2A;
               padding:12px 24px;border-radius:8px;
               text-decoration:none;font-weight:bold;">
               Acessar Área de Membros
            </a>
          `,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("Erro interno:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
