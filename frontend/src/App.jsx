import React, { useEffect, useState } from "react";
import MapView from "./components/MapView";
import TeamPanel from "./components/TeamPanel";
import Header from "./components/Header";
import { io } from "socket.io-client";

export default function App() {
  const [offQueue, setOffQueue] = useState([]);
  const [defQueue, setDefQueue] = useState([]);
  const [offFrame, setOffFrame] = useState(null);
  const [defFrame, setDefFrame] = useState(null);
  const [droneHistory, setDroneHistory] = useState({});
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [filter, setFilter] = useState("ALL"); // Log filter
  const [mapMode, setMapMode] = useState("ALL"); // Map mode: ALL | SPLIT

  // 🧠 Log helper
  function addLog(msg, type = "SYSTEM") {
    const time = new Date().toLocaleTimeString("th-TH", { hour12: false });
    const entry = { time, msg, type };
    setLogs((prev) => [entry, ...prev].slice(0, 200));
  }

  function clearLogs() {
    setLogs([]);
    addLog("🧹 Log cleared", "SYSTEM");
  }

  function saveLogs() {
    const text = logs.map((l) => `[${l.time}] (${l.type}) ${l.msg}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drone_log_${new Date()
      .toLocaleTimeString("th-TH", { hour12: false })
      .replace(/[:]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ✅ โหลดข้อมูลเริ่มต้น
  useEffect(() => {
    async function fetchInitialData() {
      try {
        const [offRes, defRes] = await Promise.all([
          fetch(
            "https://tesa-api.crma.dev/api/object-detection/31108320-f0cf-4691-ba1f-65ffa8c78f37",
            {
              headers: {
                "x-camera-token":
                  "f848664275f9bcb73197de29f42fb86c83980eeb659fb628c6bf6e48cf034682",
              },
            }
          ),
          fetch(
            "https://tesa-api.crma.dev/api/object-detection/31e1b905-9712-47d6-90c3-250a0316852f",
            {
              headers: {
                "x-camera-token":
                  "6926886e87ff323946f68a94dcfae29bdb824c4e1043987e8f363d2a91aea674",
              },
            }
          ),
        ]);

        const offJson = await offRes.json();
        const defJson = await defRes.json();

        if (Array.isArray(offJson.data)) setOffQueue(offJson.data.reverse());
        if (Array.isArray(defJson.data)) setDefQueue(defJson.data.reverse());
        addLog("✅ Initial data fetched", "SYSTEM");
      } catch {
        addLog("❌ Failed to fetch initial data", "SYSTEM");
      }
    }

    fetchInitialData();
  }, []);

  // ✅ เชื่อมต่อ socket.io
  useEffect(() => {
    const socket = io("http://localhost:8080", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
    });

    socket.on("connect", () => {
      setIsConnected(true);
      addLog("🟢 Connected to socket", "SYSTEM");
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      addLog("🔴 Disconnected from socket", "SYSTEM");
    });

    socket.io.on("reconnect_attempt", (n) => setRetryCount(n));

    // 📡 Update events
    socket.on("offensive_update", (data) => {
      if (Array.isArray(data) && data.length > 0) {
        setOffQueue(data);
        const latest = data.at(-1);
        latest?.objects?.forEach((o) => {
          const lat = parseFloat(o.lat).toFixed(6);
          const lng = parseFloat(o.lng).toFixed(6);
          addLog(
            `🚀 Offensive ${o.obj_id} detected at lat:${lat}, lng:${lng}`,
            "OFF"
          );
        });
      }
    });

    socket.on("defensive_update", (data) => {
      if (Array.isArray(data) && data.length > 0) {
        setDefQueue(data);
        const latest = data.at(-1);
        latest?.objects?.forEach((o) => {
          const lat = parseFloat(o.lat).toFixed(6);
          const lng = parseFloat(o.lng).toFixed(6);
          addLog(
            `🛡️ Defensive ${o.obj_id} detected at lat:${lat}, lng:${lng}`,
            "DEF"
          );
        });
      }
    });

    // 🧹 Clear events
    socket.on("offensive_clear", () => {
      setOffQueue([]);
      setOffFrame(null);
      setDroneHistory((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((k) => {
          if (k.startsWith("offensive")) delete updated[k];
        });
        return updated;
      });
      addLog("🧹 Offensive data cleared (event from backend)", "OFF");
    });

    socket.on("defensive_clear", () => {
      setDefQueue([]);
      setDefFrame(null);
      setDroneHistory((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((k) => {
          if (k.startsWith("defensive")) delete updated[k];
        });
        return updated;
      });
      addLog("🧹 Defensive data cleared (event from backend)", "DEF");
    });

    return () => socket.disconnect();
  }, []);

  // 🕐 จำลองแสดงเฟรมทีละ 1 วิ
  useEffect(() => {
    if (offQueue.length === 0) return;
    let i = 0;
    const interval = setInterval(() => {
      const frame = offQueue[i];
      setOffFrame(frame);
      i++;
      if (i >= offQueue.length) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [offQueue]);

  useEffect(() => {
    if (defQueue.length === 0) return;
    let i = 0;
    const interval = setInterval(() => {
      const frame = defQueue[i];
      setDefFrame(frame);
      i++;
      if (i >= defQueue.length) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [defQueue]);

  // 🛰️ เก็บประวัติพิกัดย้อนหลัง
  useEffect(() => {
    function updateHistory(team, frame) {
      if (!frame) return;
      setDroneHistory((prev) => {
        const updated = { ...prev };
        frame.objects?.forEach((o) => {
          const key = `${team}-${o.obj_id}`;
          const lat = parseFloat(o.lat);
          const lng = parseFloat(o.lng);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (!updated[key]) updated[key] = [];
            updated[key].push([lng, lat]);
            if (updated[key].length > 100) updated[key].shift();
          }
        });
        return updated;
      });
    }

    updateHistory("offensive", offFrame);
    updateHistory("defensive", defFrame);
  }, [offFrame, defFrame]);

  // ✅ รวม marker ปัจจุบัน
  const markers = [];
  if (offFrame?.objects)
    offFrame.objects.forEach((o) => {
      const lat = parseFloat(o.lat);
      const lng = parseFloat(o.lng);
      if (!isNaN(lat) && !isNaN(lng))
        markers.push({ team: "offensive", obj_id: o.obj_id, lat, lng });
    });
  if (defFrame?.objects)
    defFrame.objects.forEach((o) => {
      const lat = parseFloat(o.lat);
      const lng = parseFloat(o.lng);
      if (!isNaN(lat) && !isNaN(lng))
        markers.push({ team: "defensive", obj_id: o.obj_id, lat, lng });
    });

  // ✅ เส้นทางย้อนหลัง
  const trails = {};
  Object.entries(droneHistory).forEach(([key, coords]) => {
    trails[key] = coords.slice(-50);
  });

  // 🔍 กรอง log ตาม filter
  const filteredLogs = logs.filter((l) => {
    if (filter === "ALL") return true;
    if (filter === "SYSTEM") return l.type === "SYSTEM";
    if (filter === "OFF") return l.type === "OFF";
    if (filter === "DEF") return l.type === "DEF";
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white relative">
      {/* 🔘 สถานะการเชื่อมต่อ */}
      <div
        className={`fixed top-4 right-4 px-3 py-1 rounded-full text-sm font-medium shadow ${
          isConnected ? "bg-green-600" : "bg-red-600"
        }`}
      >
        {isConnected
          ? "Connected"
          : `Reconnecting${retryCount ? ` (#${retryCount})` : ""}`}
      </div>

      <div className="max-w-7xl mx-auto p-5 space-y-5">
        <Header />

        <div className="grid md:grid-cols-2 gap-6">
          <TeamPanel title="Offensive" data={offFrame} accent="red" />
          <TeamPanel title="Defensive" data={defFrame} accent="blue" />
        </div>

        {/* 🗺️ Map Mode Toggle */}
        <div className="flex justify-center gap-3 mb-4">
          {["ALL", "SPLIT"].map((m) => (
            <button
              key={m}
              onClick={() => setMapMode(m)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                mapMode === m
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-300"
              }`}
            >
              {m === "ALL" ? "🗺️ Combined Map" : "🪶 Split View"}
            </button>
          ))}
        </div>

        {/* 🗺️ Map Section */}
        {mapMode === "ALL" ? (
          <>
            <MapView markers={markers} trails={trails} />
            <div className="text-center mt-3 text-sm opacity-70">
              📍 Showing Combined View ({offQueue.length} offensive /{" "}
              {defQueue.length} defensive)
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ฝั่ง Offensive */}
            <div className="rounded-xl overflow-hidden border border-red-500/40 bg-red-500/10">
              <div className="text-center py-1 text-red-400 font-semibold">
                🚀 Offensive Map
              </div>
              <MapView
                markers={markers.filter((m) => m.team === "offensive")}
                trails={Object.fromEntries(
                  Object.entries(trails).filter(([key]) =>
                    key.startsWith("offensive")
                  )
                )}
                centerZoom={true} // ✅ ซูมเข้าใกล้ node
              />
            </div>

            {/* ฝั่ง Defensive */}
            <div className="rounded-xl overflow-hidden border border-blue-500/40 bg-blue-500/10">
              <div className="text-center py-1 text-blue-400 font-semibold">
                🛡️ Defensive Map
              </div>
              <MapView
                markers={markers.filter((m) => m.team === "defensive")}
                trails={Object.fromEntries(
                  Object.entries(trails).filter(([key]) =>
                    key.startsWith("defensive")
                  )
                )}
                centerZoom={true} // ✅ ซูมเข้าใกล้ node
              />
            </div>
          </div>
        )}

        {/* 🔹 Log History */}
        <div className="mt-6 bg-gray-900/60 rounded-xl p-3 text-xs font-mono overflow-y-auto max-h-64 border border-gray-700">
          <div className="flex justify-between items-center mb-2">
            <div className="font-semibold text-gray-300">📜 Log History</div>
            <div className="flex gap-2">
              {["ALL", "SYSTEM", "OFF", "DEF"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-1 rounded text-xs font-semibold transition ${
                    filter === f
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 hover:bg-gray-600"
                  }`}
                >
                  {f}
                </button>
              ))}
              <button
                onClick={saveLogs}
                className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-white text-xs"
              >
                💾 Save
              </button>
              <button
                onClick={clearLogs}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-xs"
              >
                🧹 Clear
              </button>
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="opacity-50 text-gray-400">No logs yet...</div>
          ) : (
            filteredLogs.map((log, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap ${
                  log.type === "OFF"
                    ? "text-red-400"
                    : log.type === "DEF"
                    ? "text-blue-400"
                    : "text-gray-300"
                }`}
              >
                🕒 [{log.time}] {log.msg}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
