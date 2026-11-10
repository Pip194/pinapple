import { useState } from "react";
import {
  Activity, ArrowUpRight, Bell, BookOpen, Check, ChevronRight, CircleHelp,
  Clapperboard, Command, Gamepad2, GraduationCap, Grid2X2, LockKeyhole,
  LogOut, MessageCircle, Play, Search, ShieldCheck, Sparkles, Users, X,
  Zap, Menu, ExternalLink, LayoutDashboard, Settings, Send, Clock3
} from "lucide-react";

const CLASSROOM_URL = "https://classroom.google.com/h/st";
const destinations = {
  "Minecraft":"https://www.minecraft.net/","Roblox":"https://www.roblox.com/",
  "Fortnite":"https://www.fortnite.com/","Rocket League":"https://www.rocketleague.com/",
  "EA SPORTS FC Mobile":"https://www.ea.com/games/ea-sports-fc/fc-mobile",
  "BUSSID":"https://www.maleo.web.id/","Counter-Strike":"https://www.counter-strike.net/",
  "Free Fire":"https://ff.garena.com/","YouTube":"https://www.youtube.com/",
  "Instagram":"https://www.instagram.com/","Discord":"https://discord.com/app",
  "Reddit":"https://www.reddit.com/","Pinterest":"https://www.pinterest.com/",
  "Spotify":"https://open.spotify.com/","Google Classroom":CLASSROOM_URL
};
const todayLabel = new Intl.DateTimeFormat("en", {
  weekday:"long", month:"long", day:"numeric", year:"numeric"
}).format(new Date()).toUpperCase();

const modules = [
  { id: "games", title: "Game zone", desc: "Your games, all in one place.", icon: Gamepad2, tint: "violet", tag: "PLAY", items: ["Minecraft", "Roblox", "Fortnite", "Rocket League", "EA SPORTS FC Mobile", "BUSSID", "Counter-Strike", "Free Fire"] },
  { id: "social", title: "Social corner", desc: "Quick links to your communities.", icon: Users, tint: "pink", tag: "CONNECT", items: ["YouTube", "Instagram", "Discord", "Reddit", "Pinterest", "Spotify"] },
  { id: "media", title: "Watchlist", desc: "Keep track of what you want to watch.", icon: Clapperboard, tint: "orange", tag: "DISCOVER", items: ["Movies", "Series", "Documentaries", "Anime", "My watchlist"] },
  { id: "study", title: "Study space", desc: "Get back to class in one click.", icon: BookOpen, tint: "green", tag: "FOCUS", items: ["Google Classroom", "Study planner", "Useful resources"] }
];

const quickLinks = [
  { name: "Google Classroom", url: CLASSROOM_URL, icon: GraduationCap, color: "green" },
  { name: "YouTube", url: "https://www.youtube.com/", icon: Play, color: "red" },
  { name: "Discord", url: "https://discord.com/app", icon: MessageCircle, color: "blue" },
  { name: "Instagram", url: "https://www.instagram.com/", icon: Sparkles, color: "pink" }
];

function App() {
  const [page, setPage] = useState("home");
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState([]);
  const [notice, setNotice] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [roll, setRoll] = useState("");
  const [password, setPassword] = useState("");

  const go = (next) => { setPage(next); setMobileOpen(false); setQuery(""); };
  const announce = (text) => { setNotice(text); window.setTimeout(() => setNotice(""), 2800); };
  const activeModule = modules.find(m => m.id === page);
  const filtered = activeModule ? activeModule.items.filter(item => item.toLowerCase().includes(query.toLowerCase())) : [];

  const submitPreview = (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(roll) || password.length < 8) {
      announce("Enter a four-digit roll number and an 8+ character password.");
      return;
    }
    setShowLogin(false);
    announce("Preview mode only — real sign-in will be connected to the backend.");
    setRoll("");
    setPassword("");
  };

  const navItems = [
    { id: "home", label: "Home", icon: LayoutDashboard },
    { id: "games", label: "Game zone", icon: Gamepad2 },
    { id: "social", label: "Social", icon: Users },
    { id: "media", label: "Watchlist", icon: Clapperboard },
    { id: "study", label: "Study space", icon: BookOpen },
    { id: "messages", label: "Messages", icon: MessageCircle },
    { id: "admin", label: "Admin preview", icon: ShieldCheck }
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><span>p</span><i /></div>
          <div><div className="brand-name">pinapple<span>.</span></div><div className="brand-caption">YOUR SPACE, YOUR PACE</div></div>
          <button className="icon-btn sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18}/></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav">
          {navItems.map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => go(item.id)}><Icon size={18}/><span>{item.label}</span>{item.id === "messages" && <span className="nav-dot"/>}</button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-tip"><div className="tip-icon"><Zap size={16}/></div><strong>Make it count.</strong><p>A little progress every day adds up.</p></div>
          <button className="profile-row" onClick={() => setShowLogin(true)}><div className="avatar">S</div><div className="profile-text"><strong>Student preview</strong><span>Not signed in</span></div><ChevronRight size={16}/></button>
        </div>
      </aside>

      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation"/>}
      <main className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20}/></button>
          <div className="breadcrumb"><span>PINAPPLE</span><ChevronRight size={14}/><strong>{navItems.find(n => n.id === page)?.label || "Home"}</strong></div>
          <div className="top-actions">
            <span className="status-pill"><i/> EARLY ACCESS</span>
            <button className="icon-btn" aria-label="Help" onClick={() => announce("PINAPPLE help centre is coming soon.")}><CircleHelp size={18}/></button>
            <button className="avatar top-avatar" onClick={() => setShowLogin(true)} aria-label="Open sign in">S</button>
          </div>
        </header>

        <div className="content-wrap">
          {page === "home" && <Home go={go} openLogin={() => setShowLogin(true)} announce={announce}/>}
          {activeModule && <section className="page-section">
            <div className="eyebrow"><span className={`eyebrow-dot ${activeModule.tint}`}/>{activeModule.tag} / PINAPPLE</div>
            <div className="page-heading"><div><h1>{activeModule.title}<span>.</span></h1><p>{activeModule.desc}</p></div><div className={`large-icon ${activeModule.tint}`}><activeModule.icon size={26}/></div></div>
            <div className="catalog-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${activeModule.title.toLowerCase()}...`}/><kbd>/</kbd></div><span className="result-count">{filtered.length} LINKS</span></div>
            <div className="link-grid">{filtered.map((item, i) => <button className="link-card" key={item} onClick={() => destinations[item] ? window.open(destinations[item], "_blank", "noopener,noreferrer") : announce(`${item} is a catalogue placeholder. A verified source will be added later.`)}><div className={`link-card-icon ${activeModule.tint}`}>{item.slice(0,1)}</div><div className="link-card-copy"><strong>{item}</strong><span>{activeModule.id === "games" ? "Game listing · Official access" : "Quick access link"}</span></div><ArrowUpRight size={17}/></button>)}</div>
            <div className="info-banner"><ShieldCheck size={18}/><span>PINAPPLE is a directory and student portal. Games and third-party services open through their official platforms; availability depends on your device and school policies.</span></div>
          </section>}
          {page === "messages" && <Messages message={message} setMessage={setMessage} sent={sent} setSent={setSent} announce={announce}/>}
          {page === "admin" && <AdminPreview announce={announce}/>}
        </div>
        <footer className="footer"><span>© 2026 PINAPPLE</span><span>Built for the student community <span className="footer-heart">✳</span></span><a href={CLASSROOM_URL} target="_blank" rel="noreferrer">Open Classroom <ExternalLink size={12}/></a></footer>
      </main>

      {showLogin && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setShowLogin(false)}><div className="login-modal"><button className="modal-close icon-btn" onClick={() => setShowLogin(false)}><X size={18}/></button><div className="modal-brand"><div className="brand-mark small"><span>p</span><i/></div><span>pinapple<span className="accent">.</span></span></div><div className="eyebrow"><span className="eyebrow-dot green"/> STUDENT ACCESS</div><h2>Good to see you<span>.</span></h2><p className="modal-sub">Sign-in UI preview. Account verification is not connected yet.</p><form onSubmit={submitPreview}><label>FOUR-DIGIT ROLL NUMBER</label><input className="form-input" inputMode="numeric" maxLength={4} value={roll} onChange={e => setRoll(e.target.value.replace(/\D/g, "").slice(0,4))} placeholder="e.g. 1024" required/><label>PASSWORD</label><input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required/><button className="primary-btn full" type="submit">Continue <ArrowUpRight size={17}/></button></form><div className="secure-note"><LockKeyhole size={14}/> Never use a real password in this preview.</div></div></div>}
      {notice && <div className="toast"><Check size={16}/>{notice}</div>}
    </div>
  );
}

function Home({ go, openLogin, announce }) {
  return <div className="home-page">
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot green"/> {todayLabel}</div><h1>Your space.<br/><span>Your pace.</span></h1><p className="welcome-copy">A considered space for your everyday essentials — study, community, discovery and downtime.</p><div className="hero-actions"><button className="primary-btn" onClick={openLogin}>Student sign in <ArrowUpRight size={17}/></button><a className="text-link" href={CLASSROOM_URL} target="_blank" rel="noreferrer">Open Google Classroom <ExternalLink size={14}/></a></div></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-orb"><span>p</span><i/></div><div className="float-chip chip-top"><Sparkles size={14}/> YOUR CORNER OF THE INTERNET</div><div className="float-chip chip-bottom"><span className="pulse"/> READY WHEN YOU ARE</div><div className="tiny-star star-one">✳</div><div className="tiny-star star-two">✦</div></div></div>
    <div className="section-title-row"><div><div className="eyebrow">EXPLORE</div><h2>Make today yours.</h2></div><span className="muted-count">04 SPACES</span></div>
    <div className="module-grid">{modules.map((m, i) => {const Icon=m.icon;return <button className={`module-card ${m.tint}`} key={m.id} onClick={() => go(m.id)}><div className="module-card-top"><div className="module-icon"><Icon size={20}/></div><span>{m.tag}</span></div><div className="module-card-bottom"><div><h3>{m.title}</h3><p>{m.desc}</p></div><div className="round-arrow"><ArrowUpRight size={18}/></div></div><div className="card-glow"/></button>})}</div>
    <div className="lower-grid"><section className="panel quick-panel"><div className="panel-heading"><div><div className="eyebrow">SHORTCUTS</div><h3>Jump right in</h3></div><Grid2X2 size={18}/></div><div className="quick-list">{quickLinks.map(link=>{const Icon=link.icon;return <a key={link.name} href={link.url} target="_blank" rel="noreferrer" className="quick-link"><span className={`quick-icon ${link.color}`}><Icon size={17}/></span><strong>{link.name}</strong><ArrowUpRight size={15}/></a>})}</div></section><section className="panel focus-panel"><div className="panel-heading"><div><div className="eyebrow">A LITTLE REMINDER</div><h3>Keep your balance.</h3></div><div className="focus-spark"><Sparkles size={18}/></div></div><p>Make room for fun, stay on top of your work, and look out for each other. That's the PINAPPLE way.</p><button className="outline-btn" onClick={()=>go("study")}>Visit study space <ChevronRight size={16}/></button></section></div>
    <div className="emergency-strip"><div className="emergency-icon"><GraduationCap size={19}/></div><div><strong>Need your classroom?</strong><span>Your classes are one click away.</span></div><a href={CLASSROOM_URL} target="_blank" rel="noreferrer" className="emergency-link">Open Classroom <ArrowUpRight size={16}/></a></div>
    <div className="prototype-note"><Activity size={15}/> <span>Prototype environment · Sign-in, messaging and admin analytics are visual previews only. No student data is collected or stored.</span></div>
  </div>;
}

function Messages({ message, setMessage, sent, setSent, announce }) {
  return <section className="page-section"><div className="eyebrow"><span className="eyebrow-dot pink"/> CONNECT / PINAPPLE</div><div className="page-heading"><div><h1>Messages<span>.</span></h1><p>A friendly space to keep in touch.</p></div><div className="large-icon pink"><MessageCircle size={26}/></div></div><div className="message-layout"><div className="panel message-panel"><div className="panel-heading"><div><div className="eyebrow">DEMO CONVERSATION</div><h3>PINAPPLE lounge</h3></div><span className="coming-tag">PREVIEW</span></div><div className="chat-empty"><div className="chat-bubble-icon"><MessageCircle size={22}/></div><strong>Say hello to the room.</strong><span>This local preview doesn't send messages to other people.</span></div>{sent.map((s,i)=><div className="own-message" key={i}>{s}</div>)}<form className="chat-compose" onSubmit={e=>{e.preventDefault();if(message.trim()){setSent([...sent,message.trim()]);setMessage("");announce("Message added to this local preview only.");}}}><input value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write a preview message..." maxLength={300}/><button className="send-btn" type="submit"><Send size={17}/></button></form></div><div className="panel privacy-panel"><ShieldCheck size={21}/><h3>Good conversations need good boundaries.</h3><p>Before real messaging launches, PINAPPLE will need authenticated accounts, reporting, blocking, rate limits, and clear moderation rules.</p></div></div></section>;
}

function AdminPreview({ announce }) {
  return <section className="page-section"><div className="eyebrow"><span className="eyebrow-dot orange"/> MANAGEMENT / PINAPPLE</div><div className="page-heading"><div><h1>Admin overview<span>.</span></h1><p>A transparent view of platform activity.</p></div><div className="large-icon orange"><ShieldCheck size={26}/></div></div><div className="admin-warning"><LockKeyhole size={18}/><div><strong>Preview only — no student records are connected.</strong><span>Real administrator access must be restricted to approved staff accounts.</span></div></div><div className="stats-grid">{[{label:"Registered accounts",value:"—",icon:Users},{label:"Active sessions",value:"—",icon:Activity},{label:"Module visits",value:"—",icon:Grid2X2},{label:"Messages reported",value:"—",icon:MessageCircle}].map(s=>{const Icon=s.icon;return <div className="stat-card" key={s.label}><Icon size={18}/><span>{s.label}</span><strong>{s.value}</strong><small>Not connected</small></div>})}</div><div className="panel admin-panel"><div className="panel-heading"><div><div className="eyebrow">AUDIT LOG</div><h3>Recent platform activity</h3></div><Clock3 size={18}/></div><div className="empty-state">Activity will appear here after the backend and consent-aware event logging are implemented.</div></div><div className="info-banner"><ShieldCheck size={18}/><span>Admin analytics should record only what is needed for platform operations. Passwords must never be visible, and private message contents should not be exposed in routine analytics.</span></div></section>;
}

export default App;