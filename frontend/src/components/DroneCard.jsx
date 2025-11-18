export default function DroneCard({ o }) {
  return (
    <div className="text-sm flex items-center justify-between py-1">
      <div className="truncate">• {o.obj_id}</div>
      <div className="opacity-70 ml-2">
        {parseFloat(o.lat).toFixed(6)}, {parseFloat(o.lng).toFixed(6)} — {o.size}
      </div>
    </div>
  );
}
