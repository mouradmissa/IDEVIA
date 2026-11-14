export default function TechScene({ compact = false }) {
  return (
    <div className={"scene" + (compact ? " compact" : "")} aria-hidden="true">
      <div className="scene-grid" />
      <div className="orb a" />
      <div className="orb b" />
      <div className="orb c" />
      <div className="world">
        <div className="ring r1" />
        <div className="ring r2" />
        <div className="cube">
          <i /><i /><i /><i /><i /><i />
        </div>
        <div className="slab">
          <span>SYS</span>
          <b>AI</b>
          <span>01</span>
        </div>
      </div>
    </div>
  );
}
