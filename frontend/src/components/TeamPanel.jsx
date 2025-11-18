import DroneCard from "./DroneCard";

export default function TeamPanel({ title, data, accent = "red" }) {
  const border =
    accent === "red"
      ? "border-red-500/40 bg-red-500/10"
      : "border-blue-500/40 bg-blue-500/10";

   const time = data?.timestamp
    ? new Date(data.timestamp).toISOString().replace("T", " ").slice(0, 19)
    : "-";

  // ✅ ใช้รูปจาก backend ตัวเองแทน (proxy)
  const imgUrl = data?.image_path
    ? `http://localhost:8080${data.image_path}?v=${data.timestamp}`
    : null;

  return (
    <div className={`rounded-xl border ${border} overflow-hidden`}>
      <div className="p-3 flex items-center justify-between">
        <div className="font-semibold">{title}</div>
        <div className="text-xs opacity-70">{time}</div>
      </div>

      {imgUrl ? (
        <img
          src={imgUrl}
          alt={`${title} snapshot`}
          onError={(e) => {
            e.target.style.display = "none";
          }}
          className="w-full aspect-video object-cover transition-opacity duration-500 opacity-90 hover:opacity-100"
        />
      ) : (
        <div className="h-48 flex items-center justify-center text-sm opacity-60">
          No snapshot
        </div>
      )}

      <div className="p-3">
        <div className="text-xs opacity-70 mb-2">
          {data?.camera?.name ?? "-"}
        </div>
        <div className="divide-y divide-white/10">
          {(data?.objects ?? []).map((o) => (
            <DroneCard key={o.obj_id} o={o} />
          ))}
        </div>
      </div>
    </div>
  );
}
