import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutDashboard, ShoppingBag, Shirt, Boxes, Users, Wallet,
  BarChart3, Tag, Settings as SettingsIcon, Search, Plus, Minus,
  Trash2, X, Printer, LogOut, ChevronRight, AlertTriangle,
  CheckCircle2, ArrowDownCircle, ArrowUpCircle, Banknote, QrCode,
  CreditCard, MoreHorizontal, Pencil, Package, Sparkles, Lock, Repeat, Layers, RefreshCcw, Mail,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { supabase } from "./lib/supabaseClient";

/* =========================================================================
   CHIMA STORE — ERP / PDV
   Design tokens
   Color: cream #FFF5F8 (soft pink-cream), blush #F8DCE8, rose (primary) #C15B82,
          plum/wine (text) #4A2138, muted mauve #A9798A
   Type: display serif "Fraunces" (boutique, editorial) + body sans "Inter"
   Layout: fixed left rail (icons+labels), content canvas with soft cards,
           POS uses a two-pane split with a rose cart rail on the right.
   ========================================================================= */

const CATEGORIES = ["Vestidos","Blusas","Calças","Saias","Shorts","Jaquetas","Casacos","Croppeds","Camisas","Macacões","Conjuntos","Acessórios","Bolsas","Calçados","Outros"];
const SIZES_LETTER = ["PP","P","M","G","GG","XG"];
const SIZES_NUMERIC = ["34","36","38","40","42","44","46"];
const CONDITIONS = ["Novo","Seminovo","Bom estado","Muito bom estado","Com avarias"];
const PAYMENT_METHODS = [
  { id: "dinheiro", label: "Dinheiro", icon: Banknote },
  { id: "pix", label: "PIX", icon: QrCode },
  { id: "debito", label: "Cartão de débito", icon: CreditCard },
  { id: "credito", label: "Cartão de crédito", icon: CreditCard },
  { id: "outros", label: "Outros", icon: MoreHorizontal },
];

const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (iso) => new Date(iso).toLocaleDateString("pt-BR");
const dateTimeBR = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const uid = (p = "id") => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const genSKU = (n) => `CH${String(n).padStart(3, "0")}`;

/* ---- EAN-13: real, scanner-readable barcode generation & rendering ----
   Every barcode the system prints is a valid EAN-13 symbol (95 modules,
   standard L/G/R digit patterns + guard bars), using the 20xxxxxxxxxx
   prefix reserved by GS1 for internal / in-store use, so any physical
   or camera barcode scanner can read it once printed at proper size. */
const EAN_L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const EAN_G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const EAN_R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const EAN_PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

function ean13CheckDigit(digits12) {
  const nums = digits12.split("").map(Number);
  let sum = 0;
  nums.forEach((d, i) => { sum += d * (i % 2 === 0 ? 1 : 3); });
  return (10 - (sum % 10)) % 10;
}
// Always derives a valid, correctly-checksummed 13-digit EAN-13 from any input,
// so even a hand-edited or legacy code renders as a real scannable barcode.
function toValidEAN13(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  digits = digits.length >= 12 ? digits.slice(0, 12) : digits.padStart(12, "0");
  return digits + ean13CheckDigit(digits);
}
function ean13Modules(code13) {
  const first = Number(code13[0]);
  const parity = EAN_PARITY[first];
  const left = code13.slice(1, 7).split("").map((d, i) => (parity[i] === "L" ? EAN_L[Number(d)] : EAN_G[Number(d)])).join("");
  const right = code13.slice(7, 13).split("").map((d) => EAN_R[Number(d)]).join("");
  return "101" + left + "01010" + right + "101"; // 95 modules total
}
// Sequential, GS1 internal-use (20xxxxxxxxxx) EAN-13 generator — called
// automatically the moment a piece is cadastrada.
const genBarcode = (seq = 1) => toValidEAN13("20" + String(seq).padStart(10, "0"));

function initialDB() {
  return {
    products: [],
    customers: [],
    combos: [],
    sales: [],
    movements: [],
    cashRegister: { isOpen: false, openingAmount: 0, openedAt: null, openedBy: null, movements: [] },
    cashHistory: [],
    repasses: [],
    categories: CATEGORIES,
    settings: { storeName: "Chima Store Brechó", tagline: "Moda que combina com você" },
    nextSaleNumber: 1,
    nextProductSeq: 1,
  };
}

/* -------------------------------------------------------------------- UI bits */

function Toast({ toasts }) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id}
          className={`flex items-center gap-2 rounded-2xl px-4 py-3 shadow-lg text-sm font-medium animate-[fadeSlideIn_.25s_ease] ${
            t.kind === "error" ? "bg-[#4A2138] text-[#F8DCE8]" : "bg-[#C15B82] text-white"
          }`}>
          {t.kind === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          {t.msg}
        </div>
      ))}
      <style>{`@keyframes fadeSlideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

function StatusPill({ stock, minStock }) {
  const state = stock === 0 ? "out" : stock <= minStock ? "low" : "ok";
  const map = {
    ok: { label: "Em estoque", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    low: { label: "Estoque baixo", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    out: { label: "Sem estoque", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  }[state];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${map.cls}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${state === "ok" ? "bg-emerald-500" : state === "low" ? "bg-amber-500" : "bg-rose-500"}`} />
    {map.label}
  </span>;
}

function Barcode({ value, height = 50, showDigits = true }) {
  const code13 = useMemo(() => toValidEAN13(value), [value]);
  const modules = useMemo(() => ean13Modules(code13), [code13]);
  const barsHeight = showDigits ? height - 12 : height;
  const totalW = modules.length; // 95 modules
  return (
    <svg viewBox={`0 0 ${totalW} ${height}`} width="100%" height={height} preserveAspectRatio="xMidYMid meet">
      <rect x={0} y={0} width={totalW} height={height} fill="#fff" />
      {(() => {
        const guardTall = barsHeight + 5; // start/center/end guards run slightly taller
        return modules.split("").map((m, i) => {
          if (m !== "1") return null;
          const isGuard = i < 3 || (i >= 45 && i < 50) || i >= totalW - 3;
          return <rect key={i} x={i} y={0} width={1} height={isGuard ? guardTall : barsHeight} fill="#111" />;
        });
      })()}
      {showDigits && (
        <text x={totalW / 2} y={height - 1} textAnchor="middle" fontSize={7} fontFamily="monospace" fill="#111" letterSpacing={0.5}>
          {code13}
        </text>
      )}
    </svg>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#6B3F55]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[#A9798A]">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-xl border border-[#EDD3DF] bg-white px-3.5 py-2.5 text-[14px] text-[#4A2138] placeholder:text-[#C48CA0] focus:outline-none focus:ring-2 focus:ring-[#C15B82]/40 focus:border-[#C15B82]";
const selectCls = inputCls + " appearance-none";
const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#C15B82] px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm shadow-[#C15B82]/30 transition hover:bg-[#A34468] active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none";
const btnGhost = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#EDD3DF] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#6B3F55] transition hover:bg-[#FFF5F8] active:scale-[.98]";
const card = "rounded-2xl border border-[#F2D9E4] bg-white shadow-[0_1px_2px_rgba(59,42,48,0.04)]";

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4A2138]/40 backdrop-blur-[2px] p-4">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto rounded-3xl bg-[#FFF8FA] shadow-2xl`}>
        <div className="sticky top-0 flex items-center justify-between border-b border-[#F2D9E4] bg-[#FFF8FA]/95 px-6 py-4 backdrop-blur">
          <h3 className="font-['Fraunces',serif] text-lg text-[#4A2138]">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-[#A9798A] hover:bg-[#F8DCE8]"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#EDD3DF] py-16 text-center">
      <div className="rounded-full bg-[#F8DCE8] p-3 text-[#C15B82]"><Icon size={22} /></div>
      <p className="font-['Fraunces',serif] text-[17px] text-[#4A2138]">{title}</p>
      <p className="max-w-xs text-sm text-[#A9798A]">{subtitle}</p>
      {action}
    </div>
  );
}

/* =========================================================================
   APP
   ========================================================================= */

export default function ChimaStoreERP() {
  const [db, setDb] = useState(null);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [authUser, setAuthUser] = useState(undefined); // undefined = checking, null = logged out, object = supabase user
  const [session, setSession] = useState(null); // {id, name, role} — the app-level profile
  const [profileChecked, setProfileChecked] = useState(false);
  const [view, setView] = useState("dashboard");
  const [toasts, setToasts] = useState([]);

  const notify = (msg, kind = "success") => {
    const id = uid("toast");
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  /* ---- Auth: track the Supabase session, then load the matching profile (name/role) ---- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setAuthUser(sess?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authUser === undefined) return; // still checking
    if (authUser === null) { setSession(null); setProfileChecked(true); return; }
    setProfileChecked(false);
    (async () => {
      const { data, error } = await supabase.from("profiles").select("id,name,role").eq("id", authUser.id).maybeSingle();
      if (error) {
        // Something actually failed (network, RLS, etc). Don't silently sign out —
        // surface it so it's obvious what's wrong instead of bouncing to the login screen.
        console.error("[profiles lookup] erro ao buscar perfil:", error);
        notify(`Erro ao carregar seu perfil: ${error.message}`, "error");
        setProfileChecked(true);
        return;
      }
      if (!data) {
        // Query succeeded but returned no row — this account has no profile.
        // Most common cause: it was created via signUp() while e-mail confirmation
        // was required, so the profiles.insert() step never ran.
        console.warn("[profiles lookup] nenhum perfil encontrado para", authUser.id, authUser.email);
        notify("Sua conta não tem um perfil de loja associado. Contate o administrador ou crie a linha em 'profiles'.", "error");
        await supabase.auth.signOut();
        setSession(null);
      } else {
        setSession({ id: data.id, name: data.name, role: data.role, email: authUser.email });
      }
      setProfileChecked(true);
    })();
  }, [authUser]);

  /* ---- Shared store data: a single synced row in Supabase, kept live across devices ---- */
  const lastSyncedRef = useRef(null);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.from("store_data").select("data").eq("id", 1).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setDb(initialDB());
      } else {
        const merged = { ...initialDB(), ...(data.data || {}) };
        lastSyncedRef.current = JSON.stringify(merged);
        setDb(merged);
      }
      setDbLoaded(true);
    })();

    const channel = supabase
      .channel("store_data_sync")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "store_data", filter: "id=eq.1" }, (payload) => {
        const incoming = payload.new?.data;
        if (!incoming) return;
        const incomingStr = JSON.stringify(incoming);
        if (incomingStr === lastSyncedRef.current) return; // our own write echoing back
        lastSyncedRef.current = incomingStr;
        setDb({ ...initialDB(), ...incoming });
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [session]);

  useEffect(() => {
    if (!dbLoaded || !db || !session) return;
    const str = JSON.stringify(db);
    if (str === lastSyncedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      lastSyncedRef.current = str;
      await supabase.from("store_data").update({ data: db, updated_by: session.id, updated_at: new Date().toISOString() }).eq("id", 1);
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [db, dbLoaded, session]);

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setDb(null);
    setDbLoaded(false);
  };

  if (authUser === undefined || !profileChecked) {
    return <div className="flex h-screen items-center justify-center bg-[#FFF5F8] font-['Inter',sans-serif] text-[#A9798A]">Carregando…</div>;
  }

  if (!session) {
    return <Login notify={notify} />;
  }

  if (!dbLoaded || !db) {
    return <div className="flex h-screen items-center justify-center bg-[#FFF5F8] font-['Inter',sans-serif] text-[#A9798A]">Carregando dados da loja…</div>;
  }

  const NAV = [
    { id: "dashboard", label: "Painel", icon: LayoutDashboard, roles: ["admin", "caixa"] },
    { id: "pdv", label: "PDV", icon: ShoppingBag, roles: ["admin", "caixa"] },
    { id: "products", label: "Peças", icon: Shirt, roles: ["admin"] },
    { id: "combos", label: "Combos", icon: Layers, roles: ["admin"] },
    { id: "inventory", label: "Estoque", icon: Boxes, roles: ["admin"] },
    { id: "customers", label: "Clientes", icon: Users, roles: ["admin", "caixa"] },
    { id: "cash", label: "Caixa", icon: Wallet, roles: ["admin", "caixa"] },
    { id: "consignment", label: "Repasse", icon: Repeat, roles: ["admin"] },
    { id: "labels", label: "Etiquetas", icon: Tag, roles: ["admin"] },
    { id: "reports", label: "Relatórios", icon: BarChart3, roles: ["admin"] },
    { id: "settings", label: "Configurações", icon: SettingsIcon, roles: ["admin"] },
  ].filter((n) => n.roles.includes(session.role));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#FFF5F8] font-['Inter',sans-serif] text-[#4A2138]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600;700&display=swap');
      `}</style>

      <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#F2D9E4] bg-[#FFF8FA] px-3 py-5">
        <div className="mb-6 px-3">
          <div className="font-['Fraunces',serif] text-[22px] leading-none tracking-tight text-[#4A2138]">Chima Store</div>
          <div className="font-['Fraunces',serif] text-[11px] tracking-[0.25em] text-[#C15B82]">BRECHÓ</div>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = view === n.id;
            return (
              <button key={n.id} onClick={() => setView(n.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition ${
                  active ? "bg-[#C15B82] text-white shadow-sm shadow-[#C15B82]/30" : "text-[#6B3F55] hover:bg-[#F8DCE8]/60"
                }`}>
                <Icon size={17} />
                {n.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-4 rounded-xl bg-[#F8DCE8]/50 px-3 py-3">
          <p className="text-[13px] font-semibold text-[#4A2138]">{session.name}</p>
          <p className="text-xs text-[#A9798A]">{session.role === "admin" ? "Administradora" : "Operadora de caixa"}</p>
          <button onClick={logout} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#C15B82] hover:underline">
            <LogOut size={13} /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {view === "dashboard" && <Dashboard db={db} />}
        {view === "pdv" && <PDV db={db} setDb={setDb} session={session} notify={notify} />}
        {view === "products" && <Products db={db} setDb={setDb} notify={notify} />}
        {view === "combos" && <Combos db={db} setDb={setDb} notify={notify} />}
        {view === "inventory" && <Inventory db={db} setDb={setDb} notify={notify} />}
        {view === "customers" && <Customers db={db} setDb={setDb} notify={notify} />}
        {view === "cash" && <CashRegisterView db={db} setDb={setDb} session={session} notify={notify} />}
        {view === "consignment" && <Consignment db={db} setDb={setDb} notify={notify} />}
        {view === "labels" && <Labels db={db} />}
        {view === "reports" && <Reports db={db} />}
        {view === "settings" && <SettingsView db={db} setDb={setDb} notify={notify} session={session} />}
      </main>

      <Toast toasts={toasts} />
    </div>
  );
}

/* ------------------------------------------------------------------- Login */

function normEmail(e) { return String(e || "").trim().toLowerCase(); }

function Login({ notify }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-b from-[#FFF5F8] to-[#F8DCE8]/40 font-['Inter',sans-serif]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full max-w-sm rounded-3xl border border-[#F2D9E4] bg-white/90 p-8 shadow-xl shadow-[#C15B82]/10">
        <div className="mb-1 text-center font-['Fraunces',serif] text-[28px] text-[#4A2138]">Chima Store</div>
        <div className="mb-6 text-center font-['Fraunces',serif] text-xs tracking-[0.3em] text-[#C15B82]">BRECHÓ</div>

        {mode === "login" ? <SignInForm notify={notify} /> : <SignUpForm notify={notify} />}

        <button
          className="mt-5 w-full text-center text-xs font-medium text-[#C15B82] hover:underline"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Ainda não tem acesso? Criar conta" : "Já tem uma conta? Entrar"}
        </button>
      </div>
    </div>
  );
}

function SignInForm({ notify }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  const entrar = async () => {
    if (!normEmail(email) || !senha) { notify("Informe e-mail e senha.", "error"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: normEmail(email), password: senha });
    setLoading(false);
    if (error) notify("E-mail ou senha incorretos.", "error");
  };

  return (
    <div className="space-y-3">
      <Field label="E-mail">
        <input className={inputCls} placeholder="voce@suaLoja.com" value={email} onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") entrar(); }} />
      </Field>
      <Field label="Senha">
        <input type="password" className={inputCls} placeholder="••••••••" value={senha} onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") entrar(); }} />
      </Field>
      <button className={btnPrimary + " w-full"} disabled={loading} onClick={entrar}>
        <Lock size={15} /> {loading ? "Entrando…" : "Entrar"}
      </button>
    </div>
  );
}

function SignUpForm({ notify }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [loading, setLoading] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  const valid = name.trim() && normEmail(email) && senha.length >= 6 && senha === confirma;

  const criar = async () => {
    if (!name.trim()) { notify("Informe seu nome.", "error"); return; }
    if (!normEmail(email)) { notify("Informe um e-mail válido.", "error"); return; }
    if (senha.length < 6) { notify("A senha deve ter pelo menos 6 caracteres.", "error"); return; }
    if (senha !== confirma) { notify("As senhas não coincidem.", "error"); return; }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: normEmail(email),
      password: senha,
      // Sent along as raw_user_meta_data so a DB trigger can use it to create
      // the profiles row even when e-mail confirmation delays session creation.
      options: { data: { name: name.trim() } },
    });
    if (error) {
      setLoading(false);
      notify(error.message.includes("registered") ? "Este e-mail já tem uma conta." : "Não foi possível criar a conta.", "error");
      return;
    }

    // No active session yet means the project requires e-mail confirmation.
    // The profiles row is created by the on_auth_user_created DB trigger
    // (see trigger_profiles.sql), not here, since we won't have a session
    // to insert with until after the user confirms and logs in.
    if (!data.session) {
      setLoading(false);
      setAwaitingConfirm(true);
      return;
    }

    // Session created immediately (e-mail confirmation disabled): the trigger
    // already created the profiles row via raw_user_meta_data, nothing else to do.
    setLoading(false);
    notify(`Conta criada! Bem-vinda, ${name.trim()}.`);
  };

  if (awaitingConfirm) {
    return (
      <div className="rounded-xl bg-[#F8DCE8]/60 px-4 py-4 text-center text-sm text-[#6B3F55]">
        <Mail size={20} className="mx-auto mb-2 text-[#C15B82]" />
        Enviamos um link de confirmação para <strong>{normEmail(email)}</strong>. Confirme seu e-mail e depois volte aqui para entrar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[#F8DCE8]/60 px-3.5 py-3 text-center text-xs text-[#6B3F55]">
        A primeira conta criada vira administradora da loja. As próximas entram como caixa e podem ser promovidas depois.
      </div>
      <Field label="Seu nome"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" /></Field>
      <Field label="E-mail"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@suaLoja.com" /></Field>
      <Field label="Senha" hint="Mínimo de 6 caracteres">
        <input type="password" className={inputCls} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
      </Field>
      <Field label="Confirmar senha">
        <input type="password" className={inputCls} value={confirma} onChange={(e) => setConfirma(e.target.value)} placeholder="••••••••" />
      </Field>
      <button className={btnPrimary + " w-full"} disabled={!valid || loading} onClick={criar}>
        <Lock size={15} /> {loading ? "Criando…" : "Criar conta e entrar"}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- Dashboard */

function PageHeader({ title, subtitle, right }) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h1 className="font-['Fraunces',serif] text-[26px] text-[#4A2138]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[#A9798A]">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={card + " p-5"}>
      <p className="text-[13px] font-medium text-[#A9798A]">{label}</p>
      <p className={`mt-1.5 font-['Fraunces',serif] text-[26px] ${accent || "text-[#4A2138]"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-[#A9798A]">{sub}</p>}
    </div>
  );
}

function Dashboard({ db }) {
  const today = new Date().toDateString();
  const salesToday = db.sales.filter((s) => s.status !== "cancelled" && new Date(s.date).toDateString() === today);
  const revenueToday = salesToday.reduce((a, s) => a + s.total, 0);
  const itemsSoldToday = salesToday.reduce((a, s) => a + s.items.reduce((x, i) => x + i.qty, 0), 0);
  const lowStock = db.products.filter((p) => p.stock <= p.minStock);
  const currentCash = db.cashRegister.isOpen
    ? db.cashRegister.openingAmount + db.cashRegister.movements.reduce((a, m) => a + (m.type === "saida" ? -m.amount : m.amount), 0)
    : 0;

  const last7 = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toDateString();
    const total = db.sales.filter((s) => s.status !== "cancelled" && new Date(s.date).toDateString() === dayStr).reduce((a, s) => a + s.total, 0);
    return { day: d.toLocaleDateString("pt-BR", { weekday: "short" }), total };
  });

  const salesByProduct = {};
  db.sales.filter((s) => s.status !== "cancelled").forEach((s) => s.items.forEach((i) => {
    salesByProduct[i.name] = (salesByProduct[i.name] || 0) + i.qty;
  }));
  const topProducts = Object.entries(salesByProduct).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="p-8">
      <PageHeader title="Painel" subtitle="Visão geral da loja hoje" />

      <div className="grid grid-cols-5 gap-4">
        <StatCard label="Vendas hoje" value={brl(revenueToday)} accent="text-[#C15B82]" />
        <StatCard label="Nº de vendas" value={salesToday.length} />
        <StatCard label="Peças vendidas" value={itemsSoldToday} />
        <StatCard label="Estoque baixo" value={lowStock.length} accent={lowStock.length ? "text-amber-600" : undefined} />
        <StatCard label="Caixa atual" value={db.cashRegister.isOpen ? brl(currentCash) : "Fechado"} />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-5">
        <div className={card + " col-span-2 p-6"}>
          <p className="mb-4 font-['Fraunces',serif] text-[16px] text-[#4A2138]">Vendas nos últimos 7 dias</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={last7}>
              <CartesianGrid stroke="#F8DCE8" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#A9798A" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#A9798A" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => brl(v)} contentStyle={{ borderRadius: 12, border: "1px solid #F2D9E4" }} />
              <Line type="monotone" dataKey="total" stroke="#C15B82" strokeWidth={2.5} dot={{ r: 3, fill: "#C15B82" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className={card + " p-6"}>
          <p className="mb-4 font-['Fraunces',serif] text-[16px] text-[#4A2138]">Peças mais vendidas</p>
          {topProducts.length === 0 ? (
            <p className="text-sm text-[#A9798A]">Ainda não há vendas registradas.</p>
          ) : (
            <ol className="space-y-3">
              {topProducts.map(([name, qty], i) => (
                <li key={name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-[#4A2138]"><span className="text-[#C15B82] font-semibold">{i + 1}.</span>{name}</span>
                  <span className="text-[#A9798A]">{qty} un.</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className={card + " mt-5 p-6"}>
        <p className="mb-4 font-['Fraunces',serif] text-[16px] text-[#4A2138]">Estoque baixo</p>
        {lowStock.length === 0 ? (
          <p className="text-sm text-[#A9798A]">Tudo certo — nenhuma peça precisa de reposição agora.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {lowStock.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-2.5">
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#4A2138]">{p.name}</p>
                  <p className="text-xs text-amber-700">Estoque: {p.stock} unidade{p.stock === 1 ? "" : "s"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Products */

function emptyProduct(nextIndex, barcodeSeq) {
  return {
    id: "", sku: genSKU(nextIndex), barcode: genBarcode(barcodeSeq), name: "", category: CATEGORIES[0],
    brand: "", size: SIZES_LETTER[2], color: "", gender: "Feminino", condition: "Bom estado",
    description: "", defectNotes: "", costPrice: "", salePrice: "", promoPrice: "",
    stock: 0, minStock: 2, location: "Loja física", image: "",
    origin: "", acquisitionDate: new Date().toISOString().slice(0, 10),
    ownership: "propria", consignor: "", consignmentSplit: 40, notes: "",
  };
}

function Products({ db, setDb, notify }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // product object or null
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = db.products.filter((p) => {
    const q = query.toLowerCase();
    return !q || [p.name, p.sku, p.barcode, p.category, p.brand, p.color].some((v) => (v || "").toLowerCase().includes(q));
  });

  const save = (prod) => {
    setDb((d) => {
      const exists = d.products.some((p) => p.id === prod.id);
      const products = exists
        ? d.products.map((p) => (p.id === prod.id ? prod : p))
        : [...d.products, { ...prod, id: uid("prod"), createdAt: new Date().toISOString() }];
      let movements = d.movements;
      if (!exists) {
        movements = [{ id: uid("mv"), productId: prod.id || products[products.length - 1].id, productName: prod.name, type: "entrada", qty: Number(prod.stock) || 0, reason: "Cadastro de peça", user: "—", date: new Date().toISOString() }, ...movements];
      }
      return { ...d, products, movements, nextProductSeq: exists ? d.nextProductSeq : d.nextProductSeq + 1 };
    });
    notify(editing?.id ? "Peça atualizada com sucesso!" : "Peça cadastrada com sucesso! Etiqueta com código de barras já pronta para impressão.");
    setEditing(null);
  };

  const remove = (id) => {
    setDb((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }));
    notify("Peça removida.");
    setConfirmDelete(null);
  };

  return (
    <div className="p-8">
      <PageHeader title="Peças" subtitle={`${db.products.length} peças cadastradas`}
        right={<button className={btnPrimary} onClick={() => setEditing(emptyProduct(db.products.length + 1, db.nextProductSeq))}><Plus size={16} /> Adicionar peça</button>} />

      <div className="mb-5 flex items-center gap-3">
        <div className="relative w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#C48CA0]" />
          <input className={inputCls + " pl-9"} placeholder="Buscar por nome, SKU, marca, cor…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Sparkles} title="Seu estoque está vazio"
          subtitle="Comece cadastrando sua primeira peça para vê-la aqui e no PDV."
          action={<button className={btnPrimary} onClick={() => setEditing(emptyProduct(1, db.nextProductSeq))}><Plus size={16} /> Cadastrar primeira peça</button>} />
      ) : (
        <div className={card + " overflow-hidden"}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F2D9E4] bg-[#FFF5F8] text-left text-[12px] font-medium text-[#A9798A]">
                <th className="px-5 py-3">Peça</th>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">Categoria</th>
                <th className="px-3 py-3">Tam.</th>
                <th className="px-3 py-3 text-right">Estoque</th>
                <th className="px-3 py-3 text-right">Preço</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-[#F8E1EA] last:border-0 hover:bg-[#FFF5F8]/60">
                  <td className="px-5 py-3">
                    <p className="font-medium text-[#4A2138]">{p.name}</p>
                    <p className="text-xs text-[#A9798A]">{p.brand} · {p.condition}{p.ownership === "consignacao" ? " · Consignação" : ""}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-[#6B3F55]">{p.sku}</td>
                  <td className="px-3 py-3 text-[#6B3F55]">{p.category}</td>
                  <td className="px-3 py-3 text-[#6B3F55]">{p.size}</td>
                  <td className="px-3 py-3 text-right text-[#6B3F55]">{p.stock}</td>
                  <td className="px-3 py-3 text-right font-medium text-[#4A2138]">{brl(p.promoPrice || p.salePrice)}</td>
                  <td className="px-3 py-3"><StatusPill stock={p.stock} minStock={p.minStock} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setEditing(p)} className="rounded-lg p-1.5 text-[#A9798A] hover:bg-[#F8DCE8] hover:text-[#C15B82]"><Pencil size={15} /></button>
                      <button onClick={() => setConfirmDelete(p)} className="rounded-lg p-1.5 text-[#A9798A] hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <ProductForm product={editing} onClose={() => setEditing(null)} onSave={save} />}
      {confirmDelete && (
        <Modal title="Remover peça" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-[#6B3F55]">Tem certeza que deseja remover <strong>{confirmDelete.name}</strong>? Essa ação não pode ser desfeita.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setConfirmDelete(null)}>Cancelar</button>
            <button className={btnPrimary + " !bg-rose-600 hover:!bg-rose-700"} onClick={() => remove(confirmDelete.id)}>Remover</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProductForm({ product, onClose, onSave }) {
  const [f, setF] = useState(product);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setV = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.name.trim() && f.salePrice !== "";

  return (
    <Modal title={product.id ? "Editar peça" : "Adicionar peça"} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome da peça"><input className={inputCls} value={f.name} onChange={set("name")} placeholder="Ex: Vestido Floral" /></Field>
        <Field label="Marca"><input className={inputCls} value={f.brand} onChange={set("brand")} /></Field>

        <Field label="Categoria">
          <select className={selectCls} value={f.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Gênero">
          <select className={selectCls} value={f.gender} onChange={set("gender")}>
            {["Feminino", "Masculino", "Unissex", "Infantil"].map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>

        <Field label="Tamanho">
          <select className={selectCls} value={f.size} onChange={set("size")}>
            <optgroup label="Letra">{SIZES_LETTER.map((s) => <option key={s}>{s}</option>)}</optgroup>
            <optgroup label="Numérico">{SIZES_NUMERIC.map((s) => <option key={s}>{s}</option>)}</optgroup>
            <option>Único</option>
          </select>
        </Field>
        <Field label="Cor"><input className={inputCls} value={f.color} onChange={set("color")} /></Field>

        <Field label="SKU"><input className={inputCls + " font-mono"} value={f.sku} onChange={set("sku")} /></Field>
        <Field label="Código de barras" hint="Gerado automaticamente ao cadastrar — pronto para leitura por leitor de código de barras">
          <div className="flex items-center gap-2">
            <input className={inputCls + " font-mono"} value={f.barcode} onChange={set("barcode")} />
            <button type="button" title="Gerar novo código" onClick={() => setV("barcode", genBarcode(Math.floor(Math.random() * 1e10)))} className="shrink-0 rounded-xl border border-[#EDD3DF] bg-white p-2.5 text-[#A9798A] hover:bg-[#F8DCE8] hover:text-[#C15B82]">
              <RefreshCcw size={16} />
            </button>
          </div>
        </Field>

        <div className="col-span-2 rounded-xl border border-dashed border-[#EDD3DF] bg-white p-3">
          <Barcode value={f.barcode} height={46} />
        </div>

        <div className="col-span-2"><Field label="Descrição"><textarea rows={2} className={inputCls} value={f.description} onChange={set("description")} /></Field></div>

        <Field label="Estado da peça">
          <select className={selectCls} value={f.condition} onChange={set("condition")}>
            {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Observações de avarias" hint="Descreva pequenos defeitos, se houver">
          <input className={inputCls} value={f.defectNotes} onChange={set("defectNotes")} placeholder="Ex: pequena marca na manga esquerda" />
        </Field>

        <Field label="Preço de custo"><input type="number" step="0.01" className={inputCls} value={f.costPrice} onChange={set("costPrice")} /></Field>
        <Field label="Preço de venda"><input type="number" step="0.01" className={inputCls} value={f.salePrice} onChange={set("salePrice")} /></Field>
        <Field label="Preço promocional" hint="Opcional"><input type="number" step="0.01" className={inputCls} value={f.promoPrice} onChange={set("promoPrice")} /></Field>
        <Field label="Localização"><input className={inputCls} value={f.location} onChange={set("location")} /></Field>

        <Field label="Quantidade em estoque"><input type="number" className={inputCls} value={f.stock} onChange={set("stock")} /></Field>
        <Field label="Estoque mínimo"><input type="number" className={inputCls} value={f.minStock} onChange={set("minStock")} /></Field>

        <Field label="Origem da peça" hint="Ex: doação, compra, parceria"><input className={inputCls} value={f.origin} onChange={set("origin")} /></Field>
        <Field label="Data de entrada"><input type="date" className={inputCls} value={String(f.acquisitionDate).slice(0, 10)} onChange={set("acquisitionDate")} /></Field>

        <div className="col-span-2">
          <span className="mb-1.5 block text-[13px] font-medium text-[#6B3F55]">Tipo de peça</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setV("ownership", "propria")}
              className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium ${f.ownership === "propria" ? "border-[#C15B82] bg-[#F8DCE8]/60 text-[#C15B82]" : "border-[#EDD3DF] text-[#A9798A]"}`}>Venda própria</button>
            <button type="button" onClick={() => setV("ownership", "consignacao")}
              className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium ${f.ownership === "consignacao" ? "border-[#C15B82] bg-[#F8DCE8]/60 text-[#C15B82]" : "border-[#EDD3DF] text-[#A9798A]"}`}>Consignação</button>
          </div>
        </div>

        {f.ownership === "consignacao" && (
          <>
            <div className="col-span-2"><Field label="Fornecedor / consignante"><input className={inputCls} value={f.consignor} onChange={set("consignor")} placeholder="Nome de quem consignou a peça" /></Field></div>
            <div className="col-span-2">
              <Field label="Percentual retido pela loja" hint={`A loja fica com ${f.consignmentSplit || 0}% e repassa ${100 - (Number(f.consignmentSplit) || 0)}% ao consignante em cada venda.`}>
                <input type="number" min={0} max={100} className={inputCls} value={f.consignmentSplit} onChange={set("consignmentSplit")} />
              </Field>
            </div>
          </>
        )}
        <div className="col-span-2"><Field label="Observações gerais"><textarea rows={2} className={inputCls} value={f.notes} onChange={set("notes")} /></Field></div>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-[#F2D9E4] pt-5">
        <button className={btnGhost} onClick={onClose}>Cancelar</button>
        <button disabled={!valid} className={btnPrimary} onClick={() => onSave({ ...f, costPrice: Number(f.costPrice) || 0, salePrice: Number(f.salePrice) || 0, promoPrice: f.promoPrice === "" ? "" : Number(f.promoPrice), stock: Number(f.stock) || 0, minStock: Number(f.minStock) || 0, consignmentSplit: Number(f.consignmentSplit) || 0 })}>Salvar peça</button>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- Combos */

function emptyCombo() {
  return { id: "", name: "", price: "", items: [] };
}

function Combos({ db, setDb, notify }) {
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const save = (combo) => {
    setDb((d) => {
      const exists = d.combos.some((c) => c.id === combo.id);
      const combos = exists ? d.combos.map((c) => (c.id === combo.id ? combo : c)) : [...d.combos, { ...combo, id: uid("combo") }];
      return { ...d, combos };
    });
    notify(editing?.id ? "Combo atualizado!" : "Combo criado com sucesso!");
    setEditing(null);
  };

  const remove = (id) => {
    setDb((d) => ({ ...d, combos: d.combos.filter((c) => c.id !== id) }));
    notify("Combo removido.");
    setConfirmDelete(null);
  };

  const soloTotal = (combo) => combo.items.reduce((a, ci) => {
    const p = db.products.find((x) => x.id === ci.productId);
    return a + (p ? (p.promoPrice || p.salePrice) * ci.qty : 0);
  }, 0);

  return (
    <div className="p-8">
      <PageHeader title="Combos" subtitle="Monte kits de peças vendidos por um preço fechado no PDV"
        right={<button className={btnPrimary} onClick={() => setEditing(emptyCombo())}><Plus size={16} /> Criar combo</button>} />

      {db.combos.length === 0 ? (
        <EmptyState icon={Layers} title="Nenhum combo criado ainda"
          subtitle="Combine peças (ex: vestido + bolsa) e venda por um preço especial direto no PDV."
          action={<button className={btnPrimary} onClick={() => setEditing(emptyCombo())}><Plus size={16} /> Criar primeiro combo</button>} />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {db.combos.map((c) => {
            const solo = soloTotal(c);
            const economy = solo - c.price;
            return (
              <div key={c.id} className={card + " p-5"}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-[#4A2138]">{c.name}</p>
                    <p className="text-xs text-[#A9798A]">{c.items.length} peças no kit</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(c)} className="rounded-lg p-1.5 text-[#A9798A] hover:bg-[#F8DCE8] hover:text-[#C15B82]"><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDelete(c)} className="rounded-lg p-1.5 text-[#A9798A] hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 border-t border-[#F8E1EA] pt-3 text-xs text-[#6B3F55]">
                  {c.items.map((ci, idx) => {
                    const p = db.products.find((x) => x.id === ci.productId);
                    return <li key={idx}>{ci.qty}x {p ? p.name : "Peça removida"}</li>;
                  })}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t border-[#F8E1EA] pt-3">
                  <span className="text-sm font-semibold text-[#C15B82]">{brl(c.price)}</span>
                  {economy > 0 && <span className="text-xs text-emerald-600">Economia de {brl(economy)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <ComboForm combo={editing} products={db.products} onClose={() => setEditing(null)} onSave={save} />}
      {confirmDelete && (
        <Modal title="Remover combo" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-[#6B3F55]">Remover o combo <strong>{confirmDelete.name}</strong>? As peças continuam disponíveis individualmente no estoque.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setConfirmDelete(null)}>Cancelar</button>
            <button className={btnPrimary + " !bg-rose-600 hover:!bg-rose-700"} onClick={() => remove(confirmDelete.id)}>Remover</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ComboForm({ combo, products, onClose, onSave }) {
  const [f, setF] = useState(combo);
  const addItem = () => setF((s) => ({ ...s, items: [...s.items, { productId: products[0]?.id || "", qty: 1 }] }));
  const updateItem = (idx, patch) => setF((s) => ({ ...s, items: s.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  const removeItem = (idx) => setF((s) => ({ ...s, items: s.items.filter((_, i) => i !== idx) }));
  const valid = f.name.trim() && f.price !== "" && f.items.length > 0;

  return (
    <Modal title={combo.id ? "Editar combo" : "Criar combo"} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome do combo"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex: Kit Verão" /></Field>
        <Field label="Preço do combo"><input type="number" step="0.01" className={inputCls} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-[#6B3F55]">Peças do combo</span>
          <button onClick={addItem} className={btnGhost + " !py-1.5 !px-3 text-xs"}><Plus size={13} /> Adicionar peça</button>
        </div>
        {f.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#EDD3DF] py-6 text-center text-sm text-[#A9798A]">Nenhuma peça adicionada ao combo ainda.</p>
        ) : (
          <div className="space-y-2">
            {f.items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select className={selectCls + " flex-1"} value={it.productId} onChange={(e) => updateItem(idx, { productId: e.target.value })}>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} un.)</option>)}
                </select>
                <input type="number" min={1} className={inputCls + " w-20"} value={it.qty} onChange={(e) => updateItem(idx, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                <button onClick={() => removeItem(idx)} className="text-[#C48CA0] hover:text-rose-500"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-[#F2D9E4] pt-5">
        <button className={btnGhost} onClick={onClose}>Cancelar</button>
        <button disabled={!valid} className={btnPrimary} onClick={() => onSave({ ...f, price: Number(f.price) || 0 })}>Salvar combo</button>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- Inventory */

function Inventory({ db, setDb, notify }) {
  const [tab, setTab] = useState("overview");
  const [adjusting, setAdjusting] = useState(null);

  const totalUnits = db.products.reduce((a, p) => a + p.stock, 0);
  const lowStock = db.products.filter((p) => p.stock > 0 && p.stock <= p.minStock);
  const outStock = db.products.filter((p) => p.stock === 0);
  const value = db.products.reduce((a, p) => a + p.stock * p.costPrice, 0);

  const applyMovement = (product, delta, reason) => {
    setDb((d) => ({
      ...d,
      products: d.products.map((p) => (p.id === product.id ? { ...p, stock: Math.max(0, p.stock + delta) } : p)),
      movements: [{ id: uid("mv"), productId: product.id, productName: product.name, type: "ajuste", qty: delta, reason, user: "—", date: new Date().toISOString() }, ...d.movements],
    }));
    notify("Estoque atualizado!");
    setAdjusting(null);
  };

  return (
    <div className="p-8">
      <PageHeader title="Estoque" subtitle="Visão geral, movimentações e ajustes" />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatCard label="Total de peças" value={db.products.length} />
        <StatCard label="Total de unidades" value={totalUnits} />
        <StatCard label="Estoque baixo" value={lowStock.length} accent={lowStock.length ? "text-amber-600" : undefined} />
        <StatCard label="Valor em estoque (custo)" value={brl(value)} />
      </div>

      <div className="mb-5 flex gap-2">
        {[["overview", "Visão geral"], ["movements", "Movimentações"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-4 py-2 text-sm font-medium ${tab === id ? "bg-[#C15B82] text-white" : "bg-white text-[#6B3F55] border border-[#EDD3DF]"}`}>{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className={card + " overflow-hidden"}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F2D9E4] bg-[#FFF5F8] text-left text-[12px] font-medium text-[#A9798A]">
                <th className="px-5 py-3">Peça</th><th className="px-3 py-3">Categoria</th><th className="px-3 py-3 text-right">Estoque</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {db.products.map((p) => (
                <tr key={p.id} className="border-b border-[#F8E1EA] last:border-0">
                  <td className="px-5 py-3 font-medium text-[#4A2138]">{p.name}</td>
                  <td className="px-3 py-3 text-[#6B3F55]">{p.category}</td>
                  <td className="px-3 py-3 text-right text-[#6B3F55]">{p.stock}</td>
                  <td className="px-3 py-3"><StatusPill stock={p.stock} minStock={p.minStock} /></td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button title="Adicionar" onClick={() => applyMovement(p, 1, "Entrada manual")} className="rounded-lg p-1.5 text-[#A9798A] hover:bg-emerald-50 hover:text-emerald-600"><Plus size={15} /></button>
                      <button title="Remover" onClick={() => setAdjusting(p)} className="rounded-lg p-1.5 text-[#A9798A] hover:bg-rose-50 hover:text-rose-600"><Minus size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "movements" && (
        <div className={card + " divide-y divide-[#F8E1EA]"}>
          {db.movements.length === 0 ? (
            <div className="p-8"><EmptyState icon={Boxes} title="Nenhuma movimentação ainda" subtitle="As entradas, vendas e ajustes de estoque aparecerão aqui." /></div>
          ) : db.movements.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                {m.qty >= 0 ? <ArrowUpCircle size={18} className="text-emerald-500" /> : <ArrowDownCircle size={18} className="text-rose-500" />}
                <div>
                  <p className="text-sm font-medium text-[#4A2138]">{m.qty > 0 ? "+" : ""}{m.qty} {m.productName}</p>
                  <p className="text-xs text-[#A9798A]">Motivo: {m.reason}</p>
                </div>
              </div>
              <p className="text-xs text-[#A9798A]">{dateTimeBR(m.date)}</p>
            </div>
          ))}
        </div>
      )}

      {adjusting && (
        <Modal title={`Remover unidade — ${adjusting.name}`} onClose={() => setAdjusting(null)}>
          <AdjustForm product={adjusting} onConfirm={(reason) => applyMovement(adjusting, -1, reason)} />
        </Modal>
      )}
    </div>
  );
}

function AdjustForm({ product, onConfirm }) {
  const [reason, setReason] = useState("Peça danificada");
  return (
    <div>
      <Field label="Motivo do ajuste">
        <select className={selectCls} value={reason} onChange={(e) => setReason(e.target.value)}>
          {["Peça danificada", "Extravio", "Devolução ao consignante", "Correção de cadastro", "Outro"].map((r) => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <div className="mt-5 flex justify-end">
        <button className={btnPrimary} onClick={() => onConfirm(reason)} disabled={product.stock <= 0}>Confirmar remoção</button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Customers */

function Customers({ db, setDb, notify }) {
  const [form, setForm] = useState(null);
  const [query, setQuery] = useState("");

  const filtered = db.customers.filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()));

  const save = (c) => {
    setDb((d) => ({ ...d, customers: c.id ? d.customers.map((x) => (x.id === c.id ? c : x)) : [...d.customers, { ...c, id: uid("cust") }] }));
    notify("Cliente salva com sucesso!");
    setForm(null);
  };

  return (
    <div className="p-8">
      <PageHeader title="Clientes" subtitle={`${db.customers.length} clientes cadastradas`}
        right={<button className={btnPrimary} onClick={() => setForm({ name: "", cpf: "", phone: "", email: "", birthday: "", notes: "" })}><Plus size={16} /> Adicionar cliente</button>} />

      <div className="relative mb-5 w-80">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#C48CA0]" />
        <input className={inputCls + " pl-9"} placeholder="Buscar cliente…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Nenhuma cliente encontrada" subtitle="Cadastre clientes para acompanhar o histórico de compras." />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((c) => {
            const history = db.sales.filter((s) => s.customerId === c.id && s.status !== "cancelled");
            return (
              <div key={c.id} className={card + " p-5"}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-[#4A2138]">{c.name}</p>
                    <p className="text-xs text-[#A9798A]">{c.phone || "Sem telefone"}</p>
                  </div>
                  <button onClick={() => setForm(c)} className="rounded-lg p-1.5 text-[#A9798A] hover:bg-[#F8DCE8] hover:text-[#C15B82]"><Pencil size={14} /></button>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[#F8E1EA] pt-3 text-xs text-[#A9798A]">
                  <span>{history.length} compra{history.length === 1 ? "" : "s"}</span>
                  <span>{brl(history.reduce((a, s) => a + s.total, 0))}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <Modal title={form.id ? "Editar cliente" : "Adicionar cliente"} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <Field label="Nome"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="CPF" hint="Opcional"><input className={inputCls} value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></Field>
            <Field label="Telefone"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="E-mail"><input className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Aniversário"><input type="date" className={inputCls} value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} /></Field>
            <Field label="Observações"><textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setForm(null)}>Cancelar</button>
            <button className={btnPrimary} disabled={!form.name.trim()} onClick={() => save(form)}>Salvar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- PDV */

function PDV({ db, setDb, session, notify }) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]); // {key, kind, refId, name, size, unitPrice, qty, maxQty, components?}
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [payMethod, setPayMethod] = useState("pix");
  const [cashGiven, setCashGiven] = useState("");
  const [receipt, setReceipt] = useState(null);

  const combos = db.combos || [];
  const comboMax = (combo) => Math.min(...combo.items.map((ci) => {
    const prod = db.products.find((p) => p.id === ci.productId);
    return prod ? Math.floor(prod.stock / ci.qty) : 0;
  }));

  const q = query.trim().toLowerCase();
  const productResults = q === "" ? [] : db.products.filter((p) => p.stock > 0 && [p.name, p.sku, p.barcode].some((v) => v.toLowerCase().includes(q))).slice(0, 6);
  const comboResults = q === "" ? [] : combos.filter((c) => c.name.toLowerCase().includes(q) && comboMax(c) > 0).slice(0, 4);

  const addToCart = (p) => {
    if (p.stock <= 0) { notify("Peça sem estoque disponível.", "error"); return; }
    setCart((c) => {
      const key = `p_${p.id}`;
      const found = c.find((i) => i.key === key);
      if (found) {
        if (found.qty >= p.stock) { notify("Quantidade máxima em estoque atingida.", "error"); return c; }
        return c.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...c, { key, kind: "product", refId: p.id, name: p.name, size: p.size, unitPrice: p.promoPrice || p.salePrice, qty: 1, maxQty: p.stock }];
    });
    setQuery("");
  };

  const addComboToCart = (combo) => {
    const max = comboMax(combo);
    if (max <= 0) { notify("Estoque insuficiente para montar este combo.", "error"); return; }
    setCart((c) => {
      const key = `c_${combo.id}`;
      const found = c.find((i) => i.key === key);
      if (found) {
        if (found.qty >= max) { notify("Quantidade máxima do combo atingida.", "error"); return c; }
        return c.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...c, { key, kind: "combo", refId: combo.id, name: combo.name, size: null, unitPrice: combo.price, qty: 1, maxQty: max, components: combo.items }];
    });
    setQuery("");
  };

  const changeQty = (key, delta) => setCart((c) => c.map((i) => i.key === key ? { ...i, qty: Math.max(1, Math.min(i.maxQty, i.qty + delta)) } : i));
  const removeItem = (key) => setCart((c) => c.filter((i) => i.key !== key));

  const subtotal = cart.reduce((a, i) => a + i.unitPrice * i.qty, 0);
  const discount = discountType === "percent" ? subtotal * ((Number(discountValue) || 0) / 100) : Number(discountValue) || 0;
  const total = Math.max(0, subtotal - discount);
  const change = payMethod === "dinheiro" ? Math.max(0, (Number(cashGiven) || 0) - total) : 0;
  const canFinish = cart.length > 0 && (payMethod !== "dinheiro" || Number(cashGiven) >= total);

  const finalize = () => {
    if (!db.cashRegister.isOpen) { notify("Abra o caixa antes de iniciar uma venda.", "error"); return; }
    const number = db.nextSaleNumber;
    const saleTag = `Venda #${String(number).padStart(6, "0")}`;
    const sale = {
      id: uid("sale"), number, date: new Date().toISOString(),
      items: cart.map((i) => ({ productId: i.kind === "product" ? i.refId : null, comboId: i.kind === "combo" ? i.refId : null, name: i.kind === "combo" ? `${i.name} (Combo)` : i.name, size: i.size, qty: i.qty, unitPrice: i.unitPrice, total: i.unitPrice * i.qty })),
      subtotal, discountType, discountValue: Number(discountValue) || 0, discount, total,
      paymentMethod: payMethod, customerId: customerId || null, cashier: session.name,
      amountPaid: payMethod === "dinheiro" ? Number(cashGiven) : total, change, status: "active",
    };

    // Flatten stock deductions: direct products + combo components
    const deductions = {}; // productId -> qty to subtract
    const movementRows = [];
    cart.forEach((i) => {
      if (i.kind === "product") {
        deductions[i.refId] = (deductions[i.refId] || 0) + i.qty;
        movementRows.push({ id: uid("mv"), productId: i.refId, productName: i.name, type: "venda", qty: -i.qty, reason: saleTag, user: session.name, date: new Date().toISOString() });
      } else {
        i.components.forEach((ci) => {
          const totalQty = ci.qty * i.qty;
          deductions[ci.productId] = (deductions[ci.productId] || 0) + totalQty;
          const prod = db.products.find((p) => p.id === ci.productId);
          movementRows.push({ id: uid("mv"), productId: ci.productId, productName: prod ? prod.name : "", type: "venda", qty: -totalQty, reason: `${saleTag} (Combo: ${i.name})`, user: session.name, date: new Date().toISOString() });
        });
      }
    });

    setDb((d) => ({
      ...d,
      sales: [sale, ...d.sales],
      nextSaleNumber: d.nextSaleNumber + 1,
      products: d.products.map((p) => (deductions[p.id] ? { ...p, stock: Math.max(0, p.stock - deductions[p.id]) } : p)),
      movements: [...movementRows, ...d.movements],
      cashRegister: {
        ...d.cashRegister,
        movements: [{ id: uid("cm"), type: "venda", amount: total, method: payMethod, reason: saleTag, date: new Date().toISOString() }, ...d.cashRegister.movements],
      },
    }));

    notify("Venda finalizada!");
    setReceipt(sale);
    setCart([]); setDiscountValue(""); setCashGiven(""); setCustomerId(""); setPayMethod("pix");
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-8">
        <PageHeader title="PDV" subtitle="Registre uma nova venda" />

        <div className="relative mb-5">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#C48CA0]" />
          <input autoFocus className={inputCls + " py-3.5 pl-11 text-[15px]"} placeholder="Buscar produto ou código de barras…"
            value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (comboResults.length + productResults.length === 1) {
                if (comboResults.length === 1) addComboToCart(comboResults[0]);
                else addToCart(productResults[0]);
              }
            }} />
        </div>

        {query.trim() === "" ? (
          <>
            {combos.filter((c) => comboMax(c) > 0).length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#A9798A]">Combos</p>
                <div className="grid grid-cols-3 gap-3">
                  {combos.filter((c) => comboMax(c) > 0).map((c) => (
                    <button key={c.id} onClick={() => addComboToCart(c)} className={card + " flex flex-col gap-1 border-[#C15B82]/30 bg-[#FCE8F0] p-4 text-left hover:shadow-md transition"}>
                      <div className="flex h-20 items-center justify-center rounded-lg bg-[#F8DCE8]/70 text-[#C15B82]"><Layers size={26} /></div>
                      <p className="mt-1 truncate text-sm font-medium text-[#4A2138]">{c.name}</p>
                      <p className="text-xs text-[#A9798A]">{c.items.length} peças · combo</p>
                      <p className="text-sm font-semibold text-[#C15B82]">{brl(c.price)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#A9798A]">Peças</p>
            <div className="grid grid-cols-3 gap-3">
              {db.products.filter((p) => p.stock > 0).slice(0, 9).map((p) => (
                <button key={p.id} onClick={() => addToCart(p)} className={card + " flex flex-col gap-1 p-4 text-left hover:border-[#C15B82]/40 hover:shadow-md transition"}>
                  <div className="flex h-20 items-center justify-center rounded-lg bg-[#F8DCE8]/50 text-[#C15B82]"><Shirt size={26} /></div>
                  <p className="mt-1 truncate text-sm font-medium text-[#4A2138]">{p.name}</p>
                  <div className="flex items-center justify-between text-xs text-[#A9798A]"><span>Tam. {p.size}</span><span>{p.stock} un.</span></div>
                  <p className="text-sm font-semibold text-[#C15B82]">{brl(p.promoPrice || p.salePrice)}</p>
                </button>
              ))}
            </div>
          </>
        ) : productResults.length === 0 && comboResults.length === 0 ? (
          <p className="mt-6 text-sm text-[#A9798A]">Nenhuma peça ou combo encontrado para "{query}".</p>
        ) : (
          <div className="space-y-2">
            {comboResults.map((c) => (
              <button key={c.id} onClick={() => addComboToCart(c)} className={card + " flex w-full items-center gap-4 border-[#C15B82]/30 bg-[#FCE8F0] p-3.5 text-left hover:border-[#C15B82]/40"}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F8DCE8]/70 text-[#C15B82]"><Layers size={20} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#4A2138]">{c.name} <span className="text-xs font-normal text-[#C15B82]">· Combo</span></p>
                  <p className="text-xs text-[#A9798A]">{c.items.length} peças combinadas</p>
                </div>
                <p className="font-semibold text-[#C15B82]">{brl(c.price)}</p>
              </button>
            ))}
            {productResults.map((p) => (
              <button key={p.id} onClick={() => addToCart(p)} className={card + " flex w-full items-center gap-4 p-3.5 text-left hover:border-[#C15B82]/40"}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F8DCE8]/50 text-[#C15B82]"><Shirt size={20} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#4A2138]">{p.name}</p>
                  <p className="text-xs text-[#A9798A]">Tam. {p.size} · {p.stock} em estoque</p>
                </div>
                <p className="font-semibold text-[#C15B82]">{brl(p.promoPrice || p.salePrice)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex w-[380px] shrink-0 flex-col border-l border-[#F2D9E4] bg-[#FFF8FA]">
        <div className="border-b border-[#F2D9E4] px-6 py-5">
          <p className="font-['Fraunces',serif] text-[18px] text-[#4A2138]">Carrinho</p>
          {!db.cashRegister.isOpen && <p className="mt-1 text-xs font-medium text-rose-600">⚠ Caixa fechado — abra o caixa para vender</p>}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {cart.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[#A9798A]">Nenhuma peça adicionada ainda.</p>
          ) : (
            <div className="space-y-3">
              {cart.map((i) => (
                <div key={i.key} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#4A2138]">{i.name}{i.kind === "combo" && <span className="ml-1 text-xs font-normal text-[#C15B82]">· Combo</span>}</p>
                    <p className="text-xs text-[#A9798A]">{i.size ? `${i.size} — ` : ""}{brl(i.unitPrice)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => changeQty(i.key, -1)} className="rounded-md border border-[#EDD3DF] p-1 text-[#A9798A] hover:bg-[#F8DCE8]"><Minus size={12} /></button>
                    <span className="w-4 text-center text-sm">{i.qty}</span>
                    <button onClick={() => changeQty(i.key, 1)} className="rounded-md border border-[#EDD3DF] p-1 text-[#A9798A] hover:bg-[#F8DCE8]"><Plus size={12} /></button>
                  </div>
                  <button onClick={() => removeItem(i.key)} className="text-[#C48CA0] hover:text-rose-500"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <div className="mt-6 space-y-3 border-t border-dashed border-[#EDD3DF] pt-4">
              <Field label="Cliente" hint="Opcional">
                <select className={selectCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Venda sem cadastro de cliente</option>
                  {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>

              <div className="flex items-end gap-2">
                <Field label="Desconto">
                  <div className="flex overflow-hidden rounded-xl border border-[#EDD3DF]">
                    <button onClick={() => setDiscountType("percent")} className={`px-3 py-2.5 text-sm ${discountType === "percent" ? "bg-[#F8DCE8] text-[#C15B82]" : "text-[#A9798A]"}`}>%</button>
                    <button onClick={() => setDiscountType("fixed")} className={`px-3 py-2.5 text-sm ${discountType === "fixed" ? "bg-[#F8DCE8] text-[#C15B82]" : "text-[#A9798A]"}`}>R$</button>
                    <input type="number" className="w-full border-0 px-3 py-2.5 text-sm focus:outline-none" placeholder="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
                  </div>
                </Field>
              </div>

              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-[#6B3F55]">Pagamento</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {PAYMENT_METHODS.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button key={m.id} onClick={() => setPayMethod(m.id)}
                        className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-medium ${payMethod === m.id ? "border-[#C15B82] bg-[#F8DCE8]/60 text-[#C15B82]" : "border-[#EDD3DF] text-[#A9798A]"}`}>
                        <Icon size={16} />{m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {payMethod === "dinheiro" && (
                <Field label="Valor recebido">
                  <input type="number" className={inputCls} value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} placeholder="0,00" />
                  {Number(cashGiven) > 0 && <p className="mt-1 text-xs text-[#A9798A]">Troco: <strong className="text-[#4A2138]">{brl(change)}</strong></p>}
                </Field>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-[#F2D9E4] px-6 py-5">
          <div className="mb-1 flex justify-between text-sm text-[#A9798A]"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
          <div className="mb-3 flex justify-between text-sm text-[#A9798A]"><span>Desconto</span><span>-{brl(discount)}</span></div>
          <div className="mb-4 flex items-baseline justify-between">
            <span className="font-['Fraunces',serif] text-[15px] text-[#4A2138]">TOTAL</span>
            <span className="font-['Fraunces',serif] text-[24px] text-[#C15B82]">{brl(total)}</span>
          </div>
          <button disabled={!canFinish} onClick={finalize} className={btnPrimary + " w-full py-3"}>Finalizar venda</button>
        </div>
      </div>

      {receipt && <ReceiptModal sale={receipt} storeName={db.settings.storeName} tagline={db.settings.tagline} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function ReceiptModal({ sale, storeName, tagline, onClose }) {
  return (
    <Modal title="Comprovante" onClose={onClose}>
      <div id="receipt-print" className="mx-auto max-w-[280px] rounded-2xl border border-dashed border-[#EDD3DF] p-5 text-center font-mono text-[13px] text-[#4A2138]">
        <p className="font-['Fraunces',serif] text-[16px]">{storeName}</p>
        <p className="text-[11px] text-[#A9798A]">{tagline}</p>
        <div className="my-3 border-t border-dashed border-[#EDD3DF]" />
        {sale.items.map((i, idx) => (
          <div key={idx} className="flex justify-between text-left"><span>{i.qty}x {i.name}</span><span>{brl(i.total)}</span></div>
        ))}
        <div className="my-3 border-t border-dashed border-[#EDD3DF]" />
        <div className="flex justify-between"><span>Subtotal</span><span>{brl(sale.subtotal)}</span></div>
        <div className="flex justify-between"><span>Desconto</span><span>{brl(sale.discount)}</span></div>
        <div className="mt-1 flex justify-between font-bold"><span>TOTAL</span><span>{brl(sale.total)}</span></div>
        <p className="mt-2">Pagamento: {PAYMENT_METHODS.find((m) => m.id === sale.paymentMethod)?.label}</p>
        {sale.paymentMethod === "dinheiro" && <p>Troco: {brl(sale.change)}</p>}
        <div className="my-3 border-t border-dashed border-[#EDD3DF]" />
        <p className="text-[11px]">Venda #{String(sale.number).padStart(6, "0")}</p>
        <p className="text-[11px] text-[#A9798A]">{dateTimeBR(sale.date)}</p>
        <p className="mt-3 font-['Fraunces',serif] text-[12px] italic">Obrigada pela preferência!</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>Fechar</button>
        <button className={btnPrimary} onClick={() => window.print()}><Printer size={15} /> Imprimir comprovante</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Caixa */

function CashRegisterView({ db, setDb, session, notify }) {
  const [openAmount, setOpenAmount] = useState("");
  const [movType, setMovType] = useState("entrada");
  const [movAmount, setMovAmount] = useState("");
  const [movReason, setMovReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [actualCash, setActualCash] = useState("");

  const reg = db.cashRegister;
  const cashSales = reg.movements.filter((m) => m.type === "venda" && m.method === "dinheiro").reduce((a, m) => a + m.amount, 0);
  const pixSales = reg.movements.filter((m) => m.type === "venda" && m.method === "pix").reduce((a, m) => a + m.amount, 0);
  const cardSales = reg.movements.filter((m) => m.type === "venda" && (m.method === "debito" || m.method === "credito")).reduce((a, m) => a + m.amount, 0);
  const otherSales = reg.movements.filter((m) => m.type === "venda" && m.method === "outros").reduce((a, m) => a + m.amount, 0);
  const withdrawals = reg.movements.filter((m) => m.type === "saida").reduce((a, m) => a + m.amount, 0);
  const additions = reg.movements.filter((m) => m.type === "entrada").reduce((a, m) => a + m.amount, 0);
  const expectedCash = reg.openingAmount + cashSales + additions - withdrawals;

  const open = () => {
    setDb((d) => ({ ...d, cashRegister: { isOpen: true, openingAmount: Number(openAmount) || 0, openedAt: new Date().toISOString(), openedBy: session.name, movements: [] } }));
    notify("Caixa aberto!");
    setOpenAmount("");
  };

  const addMovement = () => {
    if (!movAmount || !movReason.trim()) { notify("Informe valor e motivo.", "error"); return; }
    setDb((d) => ({ ...d, cashRegister: { ...d.cashRegister, movements: [{ id: uid("cm"), type: movType, amount: Number(movAmount), reason: movReason, date: new Date().toISOString() }, ...d.cashRegister.movements] } }));
    notify("Movimento registrado!");
    setMovAmount(""); setMovReason("");
  };

  const close = () => {
    setDb((d) => ({
      ...d,
      cashHistory: [{ ...d.cashRegister, closedAt: new Date().toISOString(), closingAmount: Number(actualCash), expected: expectedCash, difference: (Number(actualCash) || 0) - expectedCash }, ...d.cashHistory],
      cashRegister: { isOpen: false, openingAmount: 0, openedAt: null, openedBy: null, movements: [] },
    }));
    notify("Caixa fechado!");
    setClosing(false); setActualCash("");
  };

  if (!reg.isOpen) {
    return (
      <div className="p-8">
        <PageHeader title="Caixa" subtitle="O caixa está fechado" />
        <div className={card + " mx-auto max-w-sm p-6"}>
          <Field label="Valor inicial"><input type="number" className={inputCls} value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} placeholder="0,00" /></Field>
          <button className={btnPrimary + " mt-4 w-full"} onClick={open}>Abrir caixa</button>
        </div>

        {db.cashHistory.length > 0 && (
          <div className="mt-8">
            <p className="mb-3 font-['Fraunces',serif] text-[16px] text-[#4A2138]">Histórico de caixa</p>
            <div className={card + " divide-y divide-[#F8E1EA]"}>
              {db.cashHistory.slice(0, 6).map((h, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-[#6B3F55]">{dateTimeBR(h.closedAt)}</span>
                  <span className={h.difference < 0 ? "text-rose-600" : h.difference > 0 ? "text-emerald-600" : "text-[#A9798A]"}>{brl(h.difference)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader title="Caixa" subtitle={`Aberto por ${reg.openedBy} em ${dateTimeBR(reg.openedAt)}`}
        right={<button className={btnGhost} onClick={() => setClosing(true)}>Fechar caixa</button>} />

      <div className="grid grid-cols-3 gap-5">
        <div className={card + " col-span-2 p-6"}>
          <p className="mb-4 font-['Fraunces',serif] text-[16px] text-[#4A2138]">Resumo do caixa atual</p>
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <span className="text-[#A9798A]">Valor de abertura</span><span className="text-right font-medium">{brl(reg.openingAmount)}</span>
            <span className="text-[#A9798A]">Vendas em dinheiro</span><span className="text-right font-medium">{brl(cashSales)}</span>
            <span className="text-[#A9798A]">Vendas em PIX</span><span className="text-right font-medium">{brl(pixSales)}</span>
            <span className="text-[#A9798A]">Vendas em cartão</span><span className="text-right font-medium">{brl(cardSales)}</span>
            <span className="text-[#A9798A]">Outras vendas</span><span className="text-right font-medium">{brl(otherSales)}</span>
            <span className="text-[#A9798A]">Entradas manuais</span><span className="text-right font-medium text-emerald-600">+{brl(additions)}</span>
            <span className="text-[#A9798A]">Saídas manuais</span><span className="text-right font-medium text-rose-600">-{brl(withdrawals)}</span>
          </div>
          <div className="mt-4 flex items-baseline justify-between border-t border-dashed border-[#EDD3DF] pt-3">
            <span className="font-['Fraunces',serif] text-[15px]">Caixa esperado</span>
            <span className="font-['Fraunces',serif] text-[24px] text-[#C15B82]">{brl(expectedCash)}</span>
          </div>
        </div>

        <div className={card + " p-6"}>
          <p className="mb-4 font-['Fraunces',serif] text-[16px] text-[#4A2138]">Movimento manual</p>
          <div className="mb-3 flex gap-2">
            <button onClick={() => setMovType("entrada")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium ${movType === "entrada" ? "bg-emerald-50 text-emerald-700" : "bg-[#FFF5F8] text-[#A9798A]"}`}>Entrada</button>
            <button onClick={() => setMovType("saida")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium ${movType === "saida" ? "bg-rose-50 text-rose-700" : "bg-[#FFF5F8] text-[#A9798A]"}`}>Saída</button>
          </div>
          <Field label="Valor"><input type="number" className={inputCls} value={movAmount} onChange={(e) => setMovAmount(e.target.value)} /></Field>
          <div className="mt-3"><Field label="Motivo"><input className={inputCls} value={movReason} onChange={(e) => setMovReason(e.target.value)} placeholder="Ex: Troco, Compra de material" /></Field></div>
          <button className={btnPrimary + " mt-4 w-full"} onClick={addMovement}>Registrar movimento</button>
        </div>
      </div>

      <div className={card + " mt-5 divide-y divide-[#F8E1EA]"}>
        {reg.movements.length === 0 ? <p className="p-5 text-sm text-[#A9798A]">Nenhuma movimentação neste caixa ainda.</p> : reg.movements.map((m) => (
          <div key={m.id} className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-[#6B3F55] capitalize">{m.type === "venda" ? `Venda (${PAYMENT_METHODS.find((p) => p.id === m.method)?.label})` : m.reason}</span>
            <span className={m.type === "saida" ? "text-rose-600" : "text-emerald-600"}>{m.type === "saida" ? "-" : "+"}{brl(m.amount)}</span>
          </div>
        ))}
      </div>

      {closing && (
        <Modal title="Fechar caixa" onClose={() => setClosing(false)}>
          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-[#A9798A]">Caixa esperado</span><span className="font-medium">{brl(expectedCash)}</span></div>
            <Field label="Valor em caixa (contagem)"><input type="number" className={inputCls} value={actualCash} onChange={(e) => setActualCash(e.target.value)} /></Field>
            {actualCash !== "" && (
              <div className={`rounded-xl px-4 py-3 text-sm font-medium ${Number(actualCash) - expectedCash === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                Diferença: {brl(Number(actualCash) - expectedCash)}
              </div>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setClosing(false)}>Cancelar</button>
            <button className={btnPrimary} disabled={actualCash === ""} onClick={close}>Confirmar fechamento</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Consignment */

function Consignment({ db, setDb, notify }) {
  const [paying, setPaying] = useState(null); // consignor name
  const [amount, setAmount] = useState("");

  const consignedProducts = db.products.filter((p) => p.ownership === "consignacao" && p.consignor);

  const rows = useMemo(() => {
    const byConsignor = {};
    db.sales.filter((s) => s.status !== "cancelled").forEach((s) => {
      s.items.forEach((item) => {
        if (!item.productId) return; // combos not tracked for consignment
        const prod = db.products.find((p) => p.id === item.productId);
        if (!prod || prod.ownership !== "consignacao" || !prod.consignor) return;
        const split = Number(prod.consignmentSplit) || 0;
        const owed = item.total * (1 - split / 100);
        byConsignor[prod.consignor] = byConsignor[prod.consignor] || { consignor: prod.consignor, totalSold: 0, totalOwed: 0 };
        byConsignor[prod.consignor].totalSold += item.total;
        byConsignor[prod.consignor].totalOwed += owed;
      });
    });
    // include consignors with registered pieces but no sales yet
    consignedProducts.forEach((p) => {
      byConsignor[p.consignor] = byConsignor[p.consignor] || { consignor: p.consignor, totalSold: 0, totalOwed: 0 };
    });
    const paid = {};
    db.repasses.forEach((r) => { paid[r.consignor] = (paid[r.consignor] || 0) + r.amount; });
    return Object.values(byConsignor).map((r) => ({ ...r, paid: paid[r.consignor] || 0, pending: Math.max(0, r.totalOwed - (paid[r.consignor] || 0)) }));
  }, [db.sales, db.products, db.repasses, consignedProducts]);

  const registerPayment = () => {
    const value = Number(amount) || 0;
    if (value <= 0) { notify("Informe um valor válido.", "error"); return; }
    setDb((d) => ({
      ...d,
      repasses: [{ id: uid("rep"), consignor: paying, amount: value, date: new Date().toISOString() }, ...d.repasses],
      cashRegister: d.cashRegister.isOpen ? {
        ...d.cashRegister,
        movements: [{ id: uid("cm"), type: "saida", amount: value, reason: `Repasse consignação — ${paying}`, date: new Date().toISOString() }, ...d.cashRegister.movements],
      } : d.cashRegister,
    }));
    notify("Repasse registrado com sucesso!");
    setPaying(null); setAmount("");
  };

  return (
    <div className="p-8">
      <PageHeader title="Repasse" subtitle="Valores a repassar às consignantes por peças vendidas" />

      {rows.length === 0 ? (
        <EmptyState icon={Repeat} title="Nenhuma peça em consignação" subtitle="Cadastre uma peça marcada como 'Consignação' para acompanhar os repasses aqui." />
      ) : (
        <div className={card + " overflow-hidden"}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F2D9E4] bg-[#FFF5F8] text-left text-[12px] font-medium text-[#A9798A]">
                <th className="px-5 py-3">Consignante</th>
                <th className="px-3 py-3 text-right">Total vendido</th>
                <th className="px-3 py-3 text-right">Valor devido</th>
                <th className="px-3 py-3 text-right">Já repassado</th>
                <th className="px-3 py-3 text-right">Pendente</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.consignor} className="border-b border-[#F8E1EA] last:border-0">
                  <td className="px-5 py-3 font-medium text-[#4A2138]">{r.consignor}</td>
                  <td className="px-3 py-3 text-right text-[#6B3F55]">{brl(r.totalSold)}</td>
                  <td className="px-3 py-3 text-right text-[#6B3F55]">{brl(r.totalOwed)}</td>
                  <td className="px-3 py-3 text-right text-emerald-600">{brl(r.paid)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-[#C15B82]">{brl(r.pending)}</td>
                  <td className="px-3 py-3 text-right">
                    <button disabled={r.pending <= 0} onClick={() => { setPaying(r.consignor); setAmount(r.pending.toFixed(2)); }} className={btnGhost + " !py-1.5 !px-3 text-xs disabled:opacity-30"}>Registrar repasse</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {db.repasses.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 font-['Fraunces',serif] text-[16px] text-[#4A2138]">Histórico de repasses</p>
          <div className={card + " divide-y divide-[#F8E1EA]"}>
            {db.repasses.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-[#6B3F55]">{r.consignor}</span>
                <span className="text-[#A9798A]">{dateTimeBR(r.date)}</span>
                <span className="font-medium text-[#4A2138]">{brl(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {paying && (
        <Modal title={`Registrar repasse — ${paying}`} onClose={() => setPaying(null)}>
          <Field label="Valor a repassar"><input type="number" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <p className="mt-2 text-xs text-[#A9798A]">Isso registra uma saída de caixa (se o caixa estiver aberto) e abate o valor pendente desta consignante.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setPaying(null)}>Cancelar</button>
            <button className={btnPrimary} onClick={registerPayment}>Confirmar repasse</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Labels */

function Labels({ db }) {
  const [selected, setSelected] = useState([]);
  const [opts, setOpts] = useState({ barcode: true, sku: true, price: true, copies: 1 });

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const products = db.products.filter((p) => selected.includes(p.id));
  const labels = products.flatMap((p) => Array.from({ length: opts.copies }).map(() => p));

  return (
    <div className="p-8">
      <PageHeader title="Etiquetas" subtitle="Selecione as peças e imprima etiquetas para o varejo" />

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-2">
          <div className={card + " max-h-[520px] overflow-y-auto divide-y divide-[#F8E1EA]"}>
            {db.products.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[#FFF5F8]/60">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-[#C15B82]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#4A2138]">{p.name}</p>
                  <p className="text-xs text-[#A9798A]">{p.sku} · Tam. {p.size}</p>
                </div>
                <span className="text-sm font-medium text-[#C15B82]">{brl(p.promoPrice || p.salePrice)}</span>
              </label>
            ))}
          </div>

          <div className={card + " mt-4 p-4"}>
            <p className="mb-3 text-sm font-medium text-[#4A2138]">Opções da etiqueta</p>
            <div className="space-y-2 text-sm text-[#6B3F55]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.barcode} onChange={(e) => setOpts({ ...opts, barcode: e.target.checked })} className="accent-[#C15B82]" /> Incluir código de barras</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.sku} onChange={(e) => setOpts({ ...opts, sku: e.target.checked })} className="accent-[#C15B82]" /> Incluir SKU</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.price} onChange={(e) => setOpts({ ...opts, price: e.target.checked })} className="accent-[#C15B82]" /> Incluir preço</label>
            </div>
            <div className="mt-3"><Field label="Cópias por peça"><input type="number" min={1} className={inputCls} value={opts.copies} onChange={(e) => setOpts({ ...opts, copies: Math.max(1, Number(e.target.value) || 1) })} /></Field></div>
            <button className={btnPrimary + " mt-4 w-full"} disabled={labels.length === 0} onClick={() => window.print()}><Printer size={15} /> Imprimir etiquetas</button>
          </div>
        </div>

        <div className="col-span-3">
          <p className="mb-3 text-sm font-medium text-[#A9798A]">Pré-visualização · Folha A4</p>
          {labels.length === 0 ? (
            <EmptyState icon={Tag} title="Nenhuma etiqueta selecionada" subtitle="Marque uma ou mais peças à esquerda para pré-visualizar as etiquetas." />
          ) : (
            <div id="labels-print" className="grid grid-cols-3 gap-3 rounded-2xl border border-[#F2D9E4] bg-white p-4">
              {labels.map((p, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-[#EDD3DF] px-3 py-4 text-center">
                  <p className="font-['Fraunces',serif] text-[11px] tracking-wide text-[#C15B82]">CHIMA STORE BRECHÓ</p>
                  <p className="text-[13px] font-semibold leading-tight text-[#4A2138]">{p.name}</p>
                  <p className="text-[11px] text-[#A9798A]">TAM {p.size}</p>
                  {opts.price && <p className="text-[13px] font-bold text-[#4A2138]">{brl(p.promoPrice || p.salePrice)}</p>}
                  {opts.barcode && <div className="w-full px-1"><Barcode value={p.barcode} height={34} /></div>}
                  {opts.sku && <p className="font-mono text-[10px] text-[#A9798A]">{p.sku}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Reports */

function Reports({ db }) {
  const [tab, setTab] = useState("sales");
  const [period, setPeriod] = useState("today");

  const inPeriod = (iso) => {
    const d = new Date(iso), now = new Date();
    if (period === "today") return d.toDateString() === now.toDateString();
    if (period === "week") { const w = new Date(now); w.setDate(now.getDate() - 7); return d >= w; }
    if (period === "month") { const m = new Date(now); m.setMonth(now.getMonth() - 1); return d >= m; }
    return true;
  };

  const salesInPeriod = db.sales.filter((s) => inPeriod(s.date));
  const active = salesInPeriod.filter((s) => s.status !== "cancelled");
  const gross = active.reduce((a, s) => a + s.subtotal, 0);
  const discounts = active.reduce((a, s) => a + s.discount, 0);
  const net = active.reduce((a, s) => a + s.total, 0);
  const byMethod = PAYMENT_METHODS.map((m) => ({ ...m, total: active.filter((s) => s.paymentMethod === m.id).reduce((a, s) => a + s.total, 0) }));

  const totalUnits = db.products.reduce((a, p) => a + p.stock, 0);
  const lowStock = db.products.filter((p) => p.stock > 0 && p.stock <= p.minStock);
  const outStock = db.products.filter((p) => p.stock === 0);
  const invValue = db.products.reduce((a, p) => a + p.stock * p.costPrice, 0);

  const revenueByProduct = {};
  active.forEach((s) => s.items.forEach((i) => { revenueByProduct[i.name] = (revenueByProduct[i.name] || 0) + i.total; }));
  const sortedProducts = Object.entries(revenueByProduct).sort((a, b) => b[1] - a[1]);

  return (
    <div className="p-8">
      <PageHeader title="Relatórios" subtitle="Acompanhe o desempenho da loja" />

      <div className="mb-5 flex items-center justify-between">
        <div className="flex gap-2">
          {[["sales", "Vendas"], ["inventory", "Estoque"], ["products", "Peças"]].map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-4 py-2 text-sm font-medium ${tab === id ? "bg-[#C15B82] text-white" : "bg-white text-[#6B3F55] border border-[#EDD3DF]"}`}>{l}</button>
          ))}
        </div>
        {tab === "sales" && (
          <div className="flex gap-2">
            {[["today", "Hoje"], ["week", "Semana"], ["month", "Mês"], ["all", "Tudo"]].map(([id, l]) => (
              <button key={id} onClick={() => setPeriod(id)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${period === id ? "bg-[#F8DCE8] text-[#C15B82]" : "text-[#A9798A]"}`}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {tab === "sales" && (
        <>
          <div className="mb-5 grid grid-cols-4 gap-4">
            <StatCard label="Nº de vendas" value={active.length} />
            <StatCard label="Vendas brutas" value={brl(gross)} />
            <StatCard label="Descontos" value={brl(discounts)} />
            <StatCard label="Vendas líquidas" value={brl(net)} accent="text-[#C15B82]" />
          </div>
          <div className={card + " p-6"}>
            <p className="mb-4 font-['Fraunces',serif] text-[16px] text-[#4A2138]">Por forma de pagamento</p>
            <div className="space-y-3">
              {byMethod.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="w-40 text-sm text-[#6B3F55]">{m.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F8E1EA]">
                    <div className="h-full rounded-full bg-[#C15B82]" style={{ width: `${net ? (m.total / net) * 100 : 0}%` }} />
                  </div>
                  <span className="w-24 text-right text-sm font-medium">{brl(m.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "inventory" && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total de peças" value={db.products.length} />
          <StatCard label="Total de unidades" value={totalUnits} />
          <StatCard label="Estoque baixo" value={lowStock.length} accent={lowStock.length ? "text-amber-600" : undefined} />
          <StatCard label="Sem estoque" value={outStock.length} accent={outStock.length ? "text-rose-600" : undefined} />
          <div className="col-span-4"><StatCard label="Valor em estoque (custo)" value={brl(invValue)} /></div>
        </div>
      )}

      {tab === "products" && (
        <div className={card + " overflow-hidden"}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#F2D9E4] bg-[#FFF5F8] text-left text-[12px] font-medium text-[#A9798A]"><th className="px-5 py-3">Peça</th><th className="px-3 py-3 text-right">Receita</th></tr></thead>
            <tbody>
              {sortedProducts.length === 0 ? (
                <tr><td colSpan={2} className="px-5 py-8 text-center text-[#A9798A]">Ainda não há dados de vendas.</td></tr>
              ) : sortedProducts.map(([name, total]) => (
                <tr key={name} className="border-b border-[#F8E1EA] last:border-0"><td className="px-5 py-3 font-medium text-[#4A2138]">{name}</td><td className="px-3 py-3 text-right">{brl(total)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Settings */

function SettingsView({ db, setDb, notify, session }) {
  const [storeName, setStoreName] = useState(db.settings.storeName);
  const [tagline, setTagline] = useState(db.settings.tagline);
  const [profiles, setProfiles] = useState(null); // null = loading
  const [confirmDelete, setConfirmDelete] = useState(null);

  const loadProfiles = async () => {
    const { data, error } = await supabase.from("profiles").select("id,name,role,created_at").order("created_at", { ascending: true });
    if (!error) setProfiles(data || []);
  };

  useEffect(() => { loadProfiles(); }, []);

  const save = () => {
    setDb((d) => ({ ...d, settings: { ...d.settings, storeName, tagline } }));
    notify("Configurações salvas!");
  };

  const admins = (profiles || []).filter((u) => u.role === "admin");

  const toggleRole = async (u) => {
    const nextRole = u.role === "admin" ? "caixa" : "admin";
    if (u.role === "admin" && admins.length <= 1) { notify("A loja precisa de ao menos uma administradora.", "error"); return; }
    const { error } = await supabase.from("profiles").update({ role: nextRole }).eq("id", u.id);
    if (error) { notify("Não foi possível alterar o perfil.", "error"); return; }
    notify(`${u.name} agora é ${nextRole === "admin" ? "administradora" : "caixa"}.`);
    loadProfiles();
  };

  const removeAccess = async (u) => {
    if (u.id === session.id) { notify("Você não pode remover o próprio acesso enquanto está logada.", "error"); return; }
    if (u.role === "admin" && admins.length <= 1) { notify("A loja precisa de ao menos uma administradora.", "error"); return; }
    const { error } = await supabase.from("profiles").delete().eq("id", u.id);
    if (error) { notify("Não foi possível remover o acesso.", "error"); return; }
    notify("Acesso removido.");
    setConfirmDelete(null);
    loadProfiles();
  };

  return (
    <div className="p-8">
      <PageHeader title="Configurações" subtitle="Informações da loja e preferências do sistema" />
      <div className={card + " max-w-lg p-6"}>
        <div className="space-y-3">
          <Field label="Nome da loja"><input className={inputCls} value={storeName} onChange={(e) => setStoreName(e.target.value)} /></Field>
          <Field label="Slogan"><input className={inputCls} value={tagline} onChange={(e) => setTagline(e.target.value)} /></Field>
        </div>
        <button className={btnPrimary + " mt-5"} onClick={save}>Salvar alterações</button>
      </div>

      <div className={card + " mt-5 max-w-lg p-6"}>
        <div className="mb-3">
          <p className="font-['Fraunces',serif] text-[16px] text-[#4A2138]">Usuárias</p>
          <p className="text-sm text-[#A9798A]">Administradora tem acesso completo. Caixa acessa PDV, clientes e o caixa atual. Novas pessoas criam a própria conta na tela de login; aqui você promove ou remove o acesso delas.</p>
        </div>

        {profiles === null ? (
          <p className="py-4 text-center text-sm text-[#A9798A]">Carregando…</p>
        ) : (
          <div className="space-y-2">
            {profiles.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-xl border border-[#F2D9E4] px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#4A2138]">{u.name}{u.id === session.id && <span className="ml-1.5 text-xs font-normal text-[#C15B82]">(você)</span>}</p>
                  <p className="truncate text-xs text-[#A9798A]">{u.role === "admin" ? "Administradora" : "Caixa"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => toggleRole(u)} className={btnGhost + " !py-1.5 !px-3 text-xs"}>
                    {u.role === "admin" ? "Tornar caixa" : "Tornar admin"}
                  </button>
                  <button onClick={() => setConfirmDelete(u)} className="rounded-lg p-1.5 text-[#A9798A] hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <Modal title="Remover acesso" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-[#6B3F55]">Tem certeza que deseja remover o acesso de <strong>{confirmDelete.name}</strong>? Ela não conseguirá mais entrar no sistema.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setConfirmDelete(null)}>Cancelar</button>
            <button className={btnPrimary + " !bg-rose-600 hover:!bg-rose-700"} onClick={() => removeAccess(confirmDelete)}>Remover</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
