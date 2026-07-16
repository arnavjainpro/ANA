import MockupFrame from './MockupFrame';

export default function UnderstandMockup() {
  return (
    <MockupFrame>
      <svg
        viewBox="0 0 340 520"
        className="h-auto w-full flex-1"
        role="img"
        aria-label="Architecture diagram mockup"
      >
        <line x1="170" y1="70" x2="80" y2="160" stroke="#A2A2AC" strokeWidth="1.5" />
        <line x1="170" y1="70" x2="260" y2="160" stroke="#A2A2AC" strokeWidth="1.5" />
        <line x1="80" y1="200" x2="80" y2="290" stroke="#A2A2AC" strokeWidth="1.5" />
        <line x1="260" y1="200" x2="260" y2="290" stroke="#A2A2AC" strokeWidth="1.5" />
        <line x1="80" y1="180" x2="210" y2="180" stroke="#A2A2AC" strokeWidth="1.5" strokeDasharray="4 4" />
        <line x1="80" y1="330" x2="150" y2="420" stroke="#A2A2AC" strokeWidth="1.5" />
        <line x1="260" y1="330" x2="190" y2="420" stroke="#A2A2AC" strokeWidth="1.5" />

        <rect x="105" y="30" width="130" height="42" rx="10" fill="#3B82F6" />
        <text x="170" y="56" textAnchor="middle" fill="#FFFFFF" fontSize="14" fontWeight="600">App entry</text>

        <rect x="25" y="160" width="110" height="42" rx="10" fill="#EFF6FF" stroke="#3B82F6" />
        <text x="80" y="186" textAnchor="middle" fill="#2563EB" fontSize="13">Auth service</text>

        <rect x="205" y="160" width="110" height="42" rx="10" fill="#EFF6FF" stroke="#3B82F6" />
        <text x="260" y="186" textAnchor="middle" fill="#2563EB" fontSize="13">Checkout</text>

        <rect x="25" y="290" width="110" height="42" rx="10" fill="#F5F7FA" stroke="#A2A2AC" />
        <text x="80" y="316" textAnchor="middle" fill="#4B4B55" fontSize="13">Database</text>

        <rect x="205" y="290" width="110" height="42" rx="10" fill="#F5F7FA" stroke="#A2A2AC" />
        <text x="260" y="316" textAnchor="middle" fill="#4B4B55" fontSize="13">Payments API</text>

        <rect x="105" y="420" width="130" height="42" rx="10" fill="#EFF6FF" stroke="#3B82F6" />
        <text x="170" y="446" textAnchor="middle" fill="#2563EB" fontSize="13">Shared models</text>
      </svg>
    </MockupFrame>
  );
}
