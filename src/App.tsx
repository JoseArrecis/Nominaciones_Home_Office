import React, { useMemo, useState, useEffect } from "react";

/**
 * Prototipo interactivo en un solo archivo.
 *
 * Qué incluye (mock):
 * - Pestañas: Dashboard, Nominaciones, Votación (drag & drop), Resultados, Programación, Admin
 * - Datos dummy de usuarios, jefaturas, proyectos y candidatos
 * - Lógica de votación con descarte aleatorio de 1 voto
 * - Voto especial del Gerente con valor aleatorio (1-3 días)
 * - Resumen de finalistas (top 3) y días de Home Office
 * - Programación de días (valida: sin lunes, ni consecutivos)
 * - Tablero de puntos de innovación por jefatura
 *
 * Nota: Es un mock de UI/estado en memoria, no persistente.
 */

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "nominations", label: "Nominaciones" },
  { id: "voting", label: "Votación" },
  { id: "results", label: "Resultados" },
  { id: "scheduling", label: "Programación" },
  { id: "admin", label: "Admin" },
];

// Teams como union type estricto
const TEAMS = ["Desarrollo", "Operaciones", "Analítica", "PO", "GTI"] as const;
type Team = (typeof TEAMS)[number];

type User = {
  id: string;
  name: string;
  role: "Integrante" | "Jefatura" | "Gerente" | "Admin" | "Asistente";
  title: string;
  team: Team;
  photo?: string;
};

type Project = {
  id: string;
  name: string;
  description?: string;
};

type Nomination = {
  id: string;
  candidateId: string;
  projectId: string;
  reason: string;
  nominatedByUserId: string; // ID del usuario que nominó
};

type Vote = {
  voterId: string; // cada jefatura vota
  picks: string[]; // top 3 candidateIds en orden
};

type ResultRow = {
  candidateId: string;
  votes: number; // total ponderado después del descarte
  days: number; // días de home office
};

const seedUsers: User[] = [
  { id: "u1", name: "Gabriel Paredes", role: "Integrante", title: "Dev Sr.", team: "Desarrollo" },
  { id: "u2", name: "Jefferson Arriola", role: "Integrante", title: "Dev", team: "Desarrollo" },
  { id: "u3", name: "Oscar González", role: "Integrante", title: "Dev", team: "Desarrollo" },
  { id: "u4", name: "Elvis Lopez", role: "Integrante", title: "Dev", team: "Desarrollo" },
  { id: "u5", name: "Maria Fernanda", role: "Integrante", title: "Data Analyst", team: "Analítica" },
  { id: "u6", name: "Alejandro Castro", role: "Integrante", title: "Ops Eng.", team: "Operaciones" },
  { id: "u7", name: "Edvin Rodríguez", role: "Integrante", title: "Ops Eng.", team: "Operaciones" },
  { id: "u8", name: "Jonathan Puluc", role: "Integrante", title: "Ops Eng.", team: "Operaciones" },
  { id: "u9", name: "Marvin Rodríguez", role: "Integrante", title: "Ops Eng.", team: "Operaciones" },
  { id: "u10", name: "Ricardo Figueroa", role: "Integrante", title: "Ops Eng.", team: "Operaciones" },  
  { id: "u11", name: "Hendrik Hurtarte", role: "Jefatura", title: "Head of Dev", team: "Desarrollo" },
  { id: "u12", name: "Walter Arroy", role: "Jefatura", title: "PO", team: "GTI" },
  { id: "u13", name: "Luz de Maria", role: "Asistente", title: "Asistente TI", team: "GTI" },
  { id: "u14", name: "Axel Tejeda", role: "Jefatura", title: "Head of Infra", team: "Operaciones" },
  { id: "u15", name: "Vladimiro Rivera", role: "Gerente", title: "CIO", team: "GTI" },
  { id: "u16", name: "Admin", role: "Admin", title: "SysAdmin", team: "Operaciones" },
];

const seedProjects: Project[] = [
  { id: "p1", name: "WebApp USA", description: "Sitio Corporativo USA" },
  { id: "p2", name: "PDF Digital", description: "Venta de la edición a travez de Suscripcion" },
  { id: "p3", name: "Market Place", description: "Venta de bienes/servicios a migrantes Guatemaltecos a sus Familiares" },
  { id: "p4", name: "RIANA", description: "Retoque automatico de fotografias" },
  { id: "p5", name: "Observabilidad IA", description: "Monitoreo automatizado atraves de Agentes de IA" },
  { id: "p6", name: "Nexus", description: "RedApp+WebApp Soy502" },
  { id: "p7", name: "CRM Soy502", description: "CRM Ventas Soy502" },
  { id: "p8", name: "Firewall", description: "Cambio de Firewall Sonic Wall a Fortinet" },
  { id: "p9", name: "CUI->NIT", description: "Requirimiento SAT" },
  { id: "p10", name: "Etiquetado AWS", description: "Etiquetado de Servicios" },
];

function classNames(...xs: (string | null | undefined | false)[]) {
  let result = "";
  for (const x of xs) {
    if (x) result += (result ? " " : "") + x;
  }
  return result;
}

// Entidades HTML para sanitización XSS
const HTML_ENTITIES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '&': '&amp;'
};

// Sanitización XSS optimizada
function sanitizeText(text: string): string {
  return text.replace(/[<>"'&]/g, (match) => HTML_ENTITIES[match] || match);
}

// Contador para IDs únicos
let idCounter = 0;

// Generación segura de IDs
function generateId(): string {
  return `${Date.now()}-${++idCounter}-${Math.random().toString(36).slice(2, 11)}`;
}

// Generar iniciales de forma eficiente
function getInitials(name: string): string {
  const parts = name.split(" ").filter(p => p.length > 0);
  return parts.slice(0, 2).map(p => p[0]).join("");
}

// Obtener estado del cronograma
function getScheduleStatus(selectedDays: number, targetDays: number, error: string): { message: string; isError: boolean } {
  if (error) return { message: sanitizeText(error), isError: true };
  if (selectedDays === targetDays) return { message: "Listo para programar", isError: false };
  return { message: "Selecciona las fechas requeridas", isError: false };
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={classNames("rounded-2xl shadow p-4 bg-white border", className)}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold mb-3">{children}</h2>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 border">{children}</span>;
}

// --- Utilidades de Votación ---

// Generación de números aleatorios seguros para votación
function randomInt(min: number, max: number) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return min + (array[0] % (max - min + 1));
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Cache gerente lookup for performance
const GERENTE_CACHE = new Map<User[], string | undefined>();

function findGerenteId(users: User[]): string | undefined {
  if (GERENTE_CACHE.has(users)) return GERENTE_CACHE.get(users);
  const gerenteId = users.find((u) => u.role === "Gerente" || u.title === "CIO")?.id;
  GERENTE_CACHE.set(users, gerenteId);
  return gerenteId;
}

function computeResults(
  nominations: Nomination[],
  votes: Vote[],
  users: User[],
  options: { discardOneRandomVote: boolean; enableGerenteBonus: boolean }
): { rows: ResultRow[]; discardedVoterId?: string } {
  const counts: Record<string, number> = {};
  const gerenteId = findGerenteId(users);

  let usedVotes = votes;
  let discardedVoterId: string | undefined;

  if (options.discardOneRandomVote && votes.length > 0) {
    const idx = randomInt(0, votes.length - 1);
    discardedVoterId = votes[idx].voterId;
    usedVotes = votes.filter((_, i) => i !== idx);
  }

  usedVotes.forEach((v) => {
    v.picks.forEach((cid) => {
      counts[cid] = (counts[cid] || 0) + 1;
    });
  });

  // Convertir a filas con días según reglas (se calcularán en etapa final)
  const rows: ResultRow[] = Object.keys(counts).map((cid) => ({ candidateId: cid, votes: counts[cid], days: 0 }));

  // Orden por votos y tomar top 3
  rows.sort((a, b) => b.votes - a.votes);
  const top3 = rows.slice(0, 3);

  const daysPerCandidate: Record<string, number> = {};
  const gerenteIdResolved = gerenteId || null;

  top3.forEach((r) => {
    const uniqueVoters = new Set<string>();
    usedVotes.forEach(v => {
      if (v.picks.includes(r.candidateId)) uniqueVoters.add(v.voterId);
    });
    const hasGerente = gerenteIdResolved && uniqueVoters.has(gerenteIdResolved);
    const n = uniqueVoters.size;

    let days = 0;
    if (n >= 2) days = 1;
    if (n >= 3 && !hasGerente) days = 2;
    if (n >= 3 && hasGerente) days = 3;

    daysPerCandidate[r.candidateId] = days;
  });

  // Aplicar voto especial del Gerente (si procede)
  if (options.enableGerenteBonus && gerenteIdResolved) {
    const gerenteVote = usedVotes.find((v) => v.voterId === gerenteIdResolved);
    if (gerenteVote) {
      gerenteVote.picks.forEach((cid) => {
        // criterio simple: si gerente votó por el candidato, puede otorgar bonus aleatorio 1-3
        const bonus = randomInt(1, 3);
        daysPerCandidate[cid] = (daysPerCandidate[cid] || 0) + bonus;
      });
    }
  }

  return {
    rows: rows.map((r, i) => ({ ...r, days: i < 3 ? (daysPerCandidate[r.candidateId] || 0) : 0 })),
    discardedVoterId,
  };
}

// Validación de programación: no lunes ni consecutivos - optimizado
function isValidSchedule(days: string[]): { ok: boolean; reason?: string } {
  if (days.length === 0) return { ok: false, reason: "Selecciona al menos un día" };
  
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const dateInfo: { timestamp: number; dayOfWeek: number }[] = [];
  
  // Procesar fechas una sola vez con cache - timezone consistente
  for (const d of days) {
    const dt = new Date(d + "T00:00:00Z");
    const dow = dt.getUTCDay();
    if (dow === 1) return { ok: false, reason: "No se permiten lunes" };
    dateInfo.push({ timestamp: dt.getTime(), dayOfWeek: dow });
  }
  
  // Verificar consecutivos
  dateInfo.sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 1; i < dateInfo.length; i++) {
    if ((dateInfo[i].timestamp - dateInfo[i - 1].timestamp) === MS_PER_DAY) {
      return { ok: false, reason: "No se permiten días consecutivos" };
    }
  }
  
  return { ok: true };
}

export default function App() {
  const [tab, setTab] = useState<string>("dashboard");
  const [users, setUsers] = useState<User[]>(seedUsers);
  const [projects, setProjects] = useState<Project[]>(seedProjects);
  const [nominations, setNominations] = useState<Nomination[]>([
    { id: "n1", candidateId: "u1", projectId: "p1", reason: "Automatizó validaciones", nominatedByUserId: "u11" },
    { id: "n2", candidateId: "u2", projectId: "p2", reason: "Integración pasarela de pago", nominatedByUserId: "u14" },
    { id: "n3", candidateId: "u2", projectId: "p3", reason: "Intetración con Stripe", nominatedByUserId: "u12" },
    { id: "n4", candidateId: "u6", projectId: "p4", reason: "Lanzamiento Versión 2.0.4", nominatedByUserId: "u14" },
  ]);

  const [candidates, setCandidates] = useState<{ id: number; name: string; projectId: string }[]>([]);
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Función para votar por un candidato (usa boards en lugar de votes)
  const voteCandidate = (userId: string, candidateId: string) => {
    setBoards((prev) => {
      const userVotes = prev[userId] || [];
      if (!userVotes.includes(candidateId)) {
        return { ...prev, [userId]: [...userVotes, candidateId] };
      }
      return prev;
    });
  };

  // Función para agregar un nuevo candidato
  const addCandidate = (name: string, projectId: string) => {
    const newCandidate = { id: candidates.length + 1, name, projectId };
    setCandidates([...candidates, newCandidate]);
  };

  // Función para drag & drop en votación
  const swapCandidates = (
    fromIndex: number,
    toIndex: number,
    candidateList: string[]
  ): string[] => {
    const list = [...candidateList];
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    return list;
  };

  // Función para cambiar de pestaña
  const switchTab = (tab: string) => {
    setActiveTab(tab);
  };

  // Estado de votación por jefatura (cada una tiene 3 casillas)
  const jefeUsers = useMemo(() => users.filter((u) => u.role === "Jefatura" || u.role === "Gerente"), [users]);
  const [boards, setBoards] = useState<Record<string, string[]>>(() => {
    const o: Record<string, string[]> = {};
    jefeUsers.forEach((j) => (o[j.id] = []));
    return o;
  });
  useEffect(() => {
    // si cambia listado de jefes, asegurar llaves
    setBoards((prev) => {
      const next: Record<string, string[]> = { ...prev };
      jefeUsers.forEach((j) => {
        if (!next[j.id]) next[j.id] = [];
      });
      return next;
    });
  }, [jefeUsers]);

  const candidatePool = useMemo(() => {
    const ids = new Set(nominations.map((n) => n.candidateId));
    return users.filter((u) => ids.has(u.id));
  }, [nominations, users]);

  // Drag & Drop simple con HTML5
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    e.dataTransfer.setData("text/plain", id);
  }
  // Función auxiliar para manejar el intercambio de slots - inmutable y simplificada
  function swapSlots(slots: string[], id: string, slotIndex: number, existingIdx: number): string[] {
    const newSlots = [...slots];
    const tmp = newSlots[slotIndex];
    newSlots[slotIndex] = id;
    if (existingIdx >= 0 && tmp) newSlots[existingIdx] = tmp;
    return newSlots;
  }

  function handleDropSlot(e: React.DragEvent, voterId: string, slotIndex: number) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setBoards((prev) => {
      const slots = [...(prev[voterId] || [])];
      const existingIdx = slots.indexOf(id);
      if (existingIdx >= 0) slots.splice(existingIdx, 1);
      
      const updatedSlots = swapSlots(slots, id, slotIndex, existingIdx);
      return { ...prev, [voterId]: updatedSlots };
    });
    setDraggingId(null);
  }

  function allowDrop(e: React.DragEvent) {
    e.preventDefault();
  }

  const [discardVote, setDiscardVote] = useState(true);
  const [enableGerenteBonus, setEnableGerenteBonus] = useState(true);

  const votes: Vote[] = useMemo(() => {
    return jefeUsers.map((j) => ({ voterId: j.id, picks: (boards[j.id] || []).filter(Boolean) }));
  }, [boards, jefeUsers]);

  const results = useMemo(
    () => computeResults(nominations, votes, users, { discardOneRandomVote: discardVote, enableGerenteBonus }),
    [nominations, votes, users, discardVote, enableGerenteBonus]
  );

  // Puntos de innovación por jefatura (mock) - dinámico
  const [innovationPoints, setInnovationPoints] = useState<Record<string, number>>(() => {
    const points: Record<string, number> = {};
    jefeUsers.forEach((j, idx) => {
      points[j.id] = Math.floor(Math.random() * 4); // 0-3 puntos aleatorios
    });
    return points;
  });

  // Programación de días
  const [scheduleByCandidate, setScheduleByCandidate] = useState<Record<string, string[]>>({});
  const [scheduleErrors, setScheduleErrors] = useState<Record<string, string>>({});

  function toggleDay(cid: string, date: string) {
    setScheduleByCandidate((prev) => {
      const set = new Set(prev[cid] || []);
      if (set.has(date)) set.delete(date);
      else set.add(date);
      return { ...prev, [cid]: Array.from(set) };
    });
  }

  function validateSchedule(cid: string) {
    const sel = scheduleByCandidate[cid] || [];
    const v = isValidSchedule(sel);
    setScheduleErrors((prev) => ({ ...prev, [cid]: v.ok ? "" : v.reason || "" }));
  }

  // Utilidades UI
  function UserBadge({ u }: { u: User }) {
    const initials = getInitials(u.name);
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
          {initials}
        </div>
        <div>
          <div className="text-sm font-medium">{sanitizeText(u.name)}</div>
          <div className="text-xs text-gray-500">{sanitizeText(`${u.title} • ${u.team}`)}</div>
        </div>
      </div>
    );
  }

  function CandidateCard({ u, draggable = false }: { u: User; draggable?: boolean }) {
    const nom = nominations.find((n) => n.candidateId === u.id);
    const proj = projects.find((p) => p.id === nom?.projectId);
    return (
      <div
        className={classNames(
          "p-3 rounded-xl border bg-white shadow-sm hover:shadow transition cursor-default",
          draggable && "cursor-move"
        )}
        draggable={draggable}
        onDragStart={(e) => draggable && handleDragStart(e, u.id)}
      >
        <div className="flex items-center justify-between mb-1">
          <UserBadge u={u} />
          <Pill>{sanitizeText(proj?.name || "Proyecto")}</Pill>
        </div>
        <div className="text-sm text-gray-700">{sanitizeText(nom?.reason || "—")}</div>
      </div>
    );
  }

  function removeVote(voterId: string, index: number) {
    setBoards((prev) => {
      const slots = [...(prev[voterId] || [])];
      slots[index] = "";
      return { ...prev, [voterId]: slots };
    });
  }

  function Slot({ voterId, index }: { voterId: string; index: number }) {
    const cid = (boards[voterId] || [])[index];
    const user = users.find((x) => x.id === cid);
    return (
      <div
        onDrop={(e) => handleDropSlot(e, voterId, index)}
        onDragOver={allowDrop}
        className={classNames(
          "min-h-[84px] border-2 border-dashed rounded-xl flex items-center justify-center p-2 bg-gray-50",
          draggingId && "border-blue-300 bg-blue-50"
        )}
      >
        {user ? (
          <div className="relative group">
            <CandidateCard u={user} draggable={false} />
            <button
              onClick={() => removeVote(voterId, index)}
              className="absolute -top-2 -right-2 w-6 h-6 bg-white text-black rounded-full text-xs border shadow hover:bg-gray-50 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Quitar voto"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="text-xs text-gray-400">Arrastra aquí</div>
        )}
      </div>
    );
  }

  // Generar 21 días próximos (excluyendo hoy) para seleccionar HO
  const nextDays = useMemo(() => {
    const out: string[] = [];
    const today = new Date();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    for (let i = 1; i <= 21; i++) {
      const d = new Date(today.getTime() + i * MS_PER_DAY);
      const iso = d.toISOString().slice(0, 10);
      out.push(iso);
    }  
    return out;
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 text-gray-900">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold">Incentivo Home Office – Prototipo</h1>
          <p className="text-sm text-gray-600">Gamificación de mérito semanal con nominaciones, votación, resultados, programación y tablero de puntos.</p>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={classNames(
                "px-3 py-2 rounded-xl text-sm border",
                tab === t.id ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Dashboard */}
        {tab === "dashboard" && (
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <SectionTitle>Resumen Semanal</SectionTitle>
              <ul className="text-sm space-y-1">
                <li>Jefaturas: {jefeUsers.length} (incluye Gerente)</li>
                <li>Candidatos nominados: {candidatePool.length}</li>
                <li>Votos emitidos: {votes.filter((v) => v.picks.length > 0).length}/{votes.length}</li>
                <li>Descarte aleatorio activado: {discardVote ? "Sí" : "No"}</li>
                <li>Voto especial del Gerente: {enableGerenteBonus ? "Sí" : "No"}</li>
              </ul>
            </Card>
            <Card>
              <SectionTitle>Tablero de Puntos</SectionTitle>
              <div className="space-y-2">
                {jefeUsers.map((j) => (
                  <div key={j.id} className="flex items-center justify-between">
                    <UserBadge u={j} />
                    <div className="flex items-center gap-2">
                      <Pill>{innovationPoints[j.id] || 0} pts</Pill>
                      {(innovationPoints[j.id] || 0) >= 4 && <Pill>+1 día extra</Pill>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <SectionTitle>Parámetros</SectionTitle>
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={discardVote} onChange={(e) => setDiscardVote(e.target.checked)} />
                  Descartar 1 voto al azar
                </label>
              </div>
              <div className="flex items-center gap-3 text-sm mt-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={enableGerenteBonus} onChange={(e) => setEnableGerenteBonus(e.target.checked)} />
                  Voto especial del Gerente (1-3 días)
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-3">* Estos toggles son solo para probar reglas en el mock.</p>
            </Card>
          </div>
        )}

        {/* Nominaciones */}
        {tab === "nominations" && (
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <SectionTitle>Candidatos Nominados</SectionTitle>
              <div className="grid gap-3">
                {candidatePool.map((u) => (
                  <CandidateCard key={u.id} u={u} draggable={false} />
                ))}
              </div>
            </Card>
            <Card>
              <SectionTitle>Agregar Nominación</SectionTitle>
              <NominationForm users={users} projects={projects} onAdd={(n) => setNominations((prev) => [...prev, n])} />
            </Card>
          </div>
        )}

        {/* Votación */}
        {tab === "voting" && (
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <SectionTitle>Pool de Candidatos (arrastra)</SectionTitle>
              <div className="grid gap-3">
                {candidatePool.map((u) => (
                  <CandidateCard key={u.id} u={u} draggable={true} />
                ))}
              </div>
            </Card>

            <div className="md:col-span-2 grid gap-4">
              {jefeUsers.map((j) => (
                <Card key={j.id}>
                  <div className="flex items-center justify-between mb-3">
                    <SectionTitle>Votos de {sanitizeText(j.name)}</SectionTitle>
                    <Pill>Seleccione 3</Pill>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3">
                    <Slot voterId={j.id} index={0} />
                    <Slot voterId={j.id} index={1} />
                    <Slot voterId={j.id} index={2} />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Resultados */}
        {tab === "results" && (
          <div className="grid gap-4">
            <Card>
              <SectionTitle>Resumen de Votación</SectionTitle>
              {results.discardedVoterId && (
                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-lg mb-3">
                  Se descartó al azar el voto de: {sanitizeText(users.find((u) => u.id === results.discardedVoterId)?.name || 'Usuario desconocido')}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2">#</th>
                      <th className="py-2">Candidato</th>
                      <th className="py-2">Votos</th>
                      <th className="py-2">Días de Home Office</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.map((r, idx) => (
                      <tr key={r.candidateId} className="border-b">
                        <td className="py-2">{idx + 1}</td>
                        <td className="py-2">
                          {(() => {
                            const user = users.find((u) => u.id === r.candidateId);
                            return user ? <UserBadge u={user} /> : <span>Usuario no encontrado</span>;
                          })()}
                        </td>
                        <td className="py-2">{r.votes}</td>
                        <td className="py-2">{r.days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mt-2">* Solo los 3 primeros reciben días según reglas. El Gerente puede añadir bonus (1-3) si está habilitado.</p>
            </Card>
          </div>
        )}

        {/* Programación */}
        {tab === "scheduling" && (
          <div className="grid md:grid-cols-2 gap-4">
            {results.rows.slice(0, 3).map((r) => {
              const u = users.find((x) => x.id === r.candidateId);
              if (!u) return null;
              const targetDays = r.days;
              return (
                <Card key={u.id}>
                  <div className="flex items-center justify-between mb-2">
                    <SectionTitle>Programación – {sanitizeText(u.name)}</SectionTitle>
                    <Pill>{targetDays} días</Pill>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">Selecciona {targetDays} fechas (no lunes, ni consecutivas).</p>
                  <div className="grid grid-cols-3 gap-2">
                    {nextDays.map((d) => {
                      const selected = (scheduleByCandidate[u.id] || []).includes(d);
                      return (
                        <button
                          key={d}
                          onClick={() => toggleDay(u.id, d)}
                          className={classNames(
                            "text-xs border rounded-lg px-2 py-1",
                            selected ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
                          )}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-sm"
                      onClick={() => validateSchedule(u.id)}
                    >
                      Validar
                    </button>
                    <span className={classNames("text-sm", scheduleErrors[u.id] ? "text-red-600" : "text-green-700")}>
                      {(() => {
                        const status = getScheduleStatus(
                          scheduleByCandidate[u.id]?.length || 0,
                          targetDays,
                          scheduleErrors[u.id] || ""
                        );
                        return status.message;
                      })()}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Admin */}
        {tab === "admin" && (
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <SectionTitle>Usuarios</SectionTitle>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2">Nombre</th>
                      <th className="py-2">Rol</th>
                      <th className="py-2">Puesto</th>
                      <th className="py-2">Equipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b">
                        <td className="py-2">{sanitizeText(u.name)}</td>
                        <td className="py-2">{sanitizeText(u.role)}</td>
                        <td className="py-2">{sanitizeText(u.title)}</td>
                        <td className="py-2">{sanitizeText(u.team)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card>
              <SectionTitle>Proyectos</SectionTitle>
              <ul className="text-sm space-y-2">
                {projects.map((p) => (
                  <li key={p.id} className="border rounded-xl p-2 bg-white">
                    <div className="font-medium">{sanitizeText(p.name)}</div>
                    <div className="text-gray-600 text-xs">{sanitizeText(p.description || "")}</div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function NominationForm({ users, projects, onAdd }: { users: User[]; projects: Project[]; onAdd: (n: Nomination) => void }) {
  const candidates = users.filter((u) => u.role === "Integrante");
  const nominators = users.filter((u) => u.role === "Jefatura" || u.role === "Gerente");

  const [candidateId, setCandidateId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [reason, setReason] = useState("");
  const [nominatedByUserId, setNominatedByUserId] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidateId || !projectId || !reason.trim() || !nominatedByUserId) {
      setError("Todos los campos son obligatorios");
      return;
    }
    setError("");
    onAdd({ id: generateId(), candidateId, projectId, reason: reason.trim(), nominatedByUserId });
    setCandidateId("");
    setProjectId("");
    setReason("");
    setNominatedByUserId("");
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="candidate-select" className="text-sm">Candidato</label>
        <select id="candidate-select" value={candidateId} onChange={(e) => setCandidateId(e.target.value)} className="w-full border rounded-lg p-2 text-sm bg-white">
          <option value="">— Selecciona —</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.team})</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="project-select" className="text-sm">Proyecto</label>
        <select id="project-select" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full border rounded-lg p-2 text-sm bg-white">
          <option value="">— Selecciona —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="reason-textarea" className="text-sm">Razón</label>
        <textarea id="reason-textarea" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border rounded-lg p-2 text-sm bg-white" rows={3} placeholder="Describe el logro / mérito" />
      </div>
      <div>
        <label htmlFor="nominator-select" className="text-sm">Nominado por</label>
        <select id="nominator-select" value={nominatedByUserId} onChange={(e) => setNominatedByUserId(e.target.value)} className="w-full border rounded-lg p-2 text-sm bg-white">
          <option value="">— Selecciona —</option>
          {nominators.map((n) => (
            <option key={n.id} value={n.id}>{sanitizeText(n.name)}</option>
          ))}
        </select>
      </div>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded-lg">
          {sanitizeText(error)}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" className="px-3 py-1.5 rounded-lg border bg-black text-white text-sm">Agregar</button>
        <span className="text-xs text-gray-500">Se añade a la lista de nominaciones</span>
      </div>
    </form>
  );
}
