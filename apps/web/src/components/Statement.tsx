import anaAvatar from '../assets/ana-avatar.png';
import Reveal from './Reveal';

interface Deco {
  id: string;
  text?: string;
  sent?: boolean;
  ana?: boolean;
  tone: string;
  position: string;
  bubbleFirst?: boolean;
}

// A mix of standalone avatars and avatars with a chat bubble, scattered organically
// like whatsapp.com's statement section.
const decos: Deco[] = [
  { id: 'a', tone: 'from-amber-200 to-orange-300', position: 'left-[10%] top-[6%]' },
  { id: 'b', text: 'What does this repo do?', sent: true, tone: 'from-rose-200 to-pink-300', position: 'left-[22%] top-[20%]' },
  { id: 'c', text: 'Walk me through the API', tone: 'from-sky-200 to-blue-300', position: 'left-[44%] top-[3%]', bubbleFirst: true },
  { id: 'd', text: "Here's the plan —", ana: true, tone: 'from-slate-200 to-slate-300', position: 'right-[6%] top-[8%]', bubbleFirst: true },
  { id: 'e', tone: 'from-emerald-200 to-teal-300', position: 'right-[16%] top-[24%]' },
  { id: 'f', text: 'Add a login page', sent: true, tone: 'from-violet-200 to-indigo-300', position: 'left-[3%] top-[58%]' },
  { id: 'g', tone: 'from-fuchsia-200 to-purple-300', position: 'left-[28%] bottom-[6%]' },
  { id: 'h', text: 'Done. Want to see the diff?', ana: true, tone: 'from-slate-200 to-slate-300', position: 'left-[38%] bottom-[2%]' },
  { id: 'i', text: 'Why is checkout slow?', sent: true, tone: 'from-cyan-200 to-sky-300', position: 'right-[3%] top-[62%]', bubbleFirst: true },
  { id: 'j', text: 'Ship it', tone: 'from-lime-200 to-green-300', position: 'right-[24%] bottom-[8%]', bubbleFirst: true },
  { id: 'k', tone: 'from-blue-200 to-cyan-300', position: 'right-[10%] bottom-[2%]' },
];

function Avatar({ deco }: { deco: Deco }) {
  return deco.ana ? (
    <img src={anaAvatar} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover shadow-md" />
  ) : (
    <span className={`h-14 w-14 shrink-0 rounded-full bg-gradient-to-br shadow-md ${deco.tone}`} />
  );
}

function ChatBubble({ deco }: { deco: Deco }) {
  return (
    <div
      className={`relative z-10 rounded-2xl px-4 py-2 text-xs shadow-sm ${
        deco.sent ? 'bg-accent-soft text-ink' : 'bg-white text-ink-secondary'
      }`}
    >
      {deco.text}
      <span className="ml-1.5 align-bottom text-[9px] text-ink-tertiary">11:59</span>
    </div>
  );
}

export default function Statement() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden py-40">
      {decos.map((deco) => (
        <div key={deco.id} className={`absolute hidden items-center lg:flex ${deco.position}`}>
          {deco.text ? (
            deco.bubbleFirst ? (
              <>
                <ChatBubble deco={deco} />
                <span className="-ml-2">
                  <Avatar deco={deco} />
                </span>
              </>
            ) : (
              <>
                <Avatar deco={deco} />
                <span className="-ml-2">
                  <ChatBubble deco={deco} />
                </span>
              </>
            )
          ) : (
            <Avatar deco={deco} />
          )}
        </div>
      ))}

      <Reveal className="mx-auto max-w-site px-6 md:px-10">
        <h2 className="mx-auto max-w-4xl text-center text-4xl font-bold leading-tight md:text-5xl xl:text-6xl">
          Say it out loud. Ana turns <span className="text-accent">plain English</span> into
          working software — no syntax, no setup, no fear of the codebase.
        </h2>
      </Reveal>
    </section>
  );
}
