const MARK_SRC = "/paperback-riders-mark.jpg";

export function PublicMasthead() {
  return (
    <header className="brand">
      <div className="logo">
        {/* The mark is a local illustration. A plain img does not send it through the optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK_SRC} alt="" />
        <h1>
          Paperback
          <br /> Riders
        </h1>
      </div>
    </header>
  );
}
