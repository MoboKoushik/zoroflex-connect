// src/renderer/dashboard/components/StatusBar.tsx
import React, { useEffect, useState } from "react";

interface TallyStatus {
  isOnline: boolean;
  lastCheckTime: string | null;
  lastSuccessTime: string | null;
  errorMessage: string | null;
  port: number;
}

interface ApiStatus {
  isOnline: boolean;
  lastCheckTime: string | null;
  lastSuccessTime: string | null;
  errorMessage: string | null;
  responseTime: number | null;
}

interface SyncStatus {
  isRunning: boolean;
  lastSyncTime: string | null;
  status: "running" | "idle" | "error";
}

export const StatusBar: React.FC = () => {
  const [tallyStatus, setTallyStatus] = useState<TallyStatus | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("StatusBar: Component mounted, starting status checks");
    loadStatus();
    const interval = setInterval(loadStatus, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      if (!window.electronAPI) {
        console.error("StatusBar: electronAPI is not available!");
        setLoading(false);
        return;
      }

      const [tally, api, sync] = await Promise.all([
        window.electronAPI.getTallyStatus?.().catch((err: any) => {
          console.error("Error getting Tally status:", err);
          return null;
        }) || Promise.resolve(null),
        window.electronAPI.getApiStatus?.().catch((err: any) => {
          console.error("Error getting API status:", err);
          return null;
        }) || Promise.resolve(null),
        window.electronAPI.getSyncStatus?.().catch((err: any) => {
          console.error("Error getting sync status:", err);
          return null;
        }) || Promise.resolve(null),
      ]);

      // Always set status, even if null (to show loading/unknown state)
      // If status is null, provide default values
      setTallyStatus(
        tally || {
          isOnline: false,
          lastCheckTime: null,
          lastSuccessTime: null,
          errorMessage: "Status not available",
          port: 9000,
        }
      );
      setApiStatus(
        api || {
          isOnline: false,
          lastCheckTime: null,
          lastSuccessTime: null,
          errorMessage: "Status not available",
          responseTime: null,
        }
      );
      setSyncStatus(
        sync || {
          isRunning: false,
          lastSyncTime: null,
          status: "idle",
        }
      );
      setLoading(false);
    } catch (error) {
      console.error("StatusBar: Error loading status:", error);
      setLoading(false);
    }
  };

  const formatTime = (timeStr: string | null): string => {
    if (!timeStr) return "Never";
    try {
      const date = new Date(timeStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);

      if (diffSecs < 60) return `${diffSecs}s ago`;
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      // For older dates, show in Indian timezone
      return date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "Invalid";
    }
  };

  const getStatusColor = (isOnline: boolean | undefined | null): string => {
    if (isOnline === undefined || isOnline === null) return "bg-gray-400";
    return isOnline ? "bg-green-500" : "bg-red-500";
  };

  const getSyncStatusColor = (status: string | undefined): string => {
    if (status === "running") return "bg-blue-500";
    if (status === "error") return "bg-red-500";
    return "bg-green-500";
  };

  if (loading) {
    return (
      <div className="bg-card p-4 rounded-lg border border-border">
        <div className="text-sm text-muted-foreground">Loading status...</div>
      </div>
    );
  }

  return (
    <div className="bg-card p-4 rounded-lg border border-border">
      <h3 className="text-sm font-semibold mb-3 text-foreground">
        System Status
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tally Status */}
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${getStatusColor(
              tallyStatus?.isOnline
            )}`}
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">Tally</div>
            <div className="text-xs text-muted-foreground">
              {tallyStatus?.isOnline ? "Online" : "Offline"}
              {tallyStatus?.port && ` (Port ${tallyStatus.port})`}
            </div>
            {tallyStatus?.lastCheckTime && (
              <div className="text-xs text-muted-foreground">
                Last check: {formatTime(tallyStatus.lastCheckTime)}
              </div>
            )}
            {tallyStatus?.errorMessage && !tallyStatus.isOnline && (
              <div className="text-xs text-red-500 mt-1">
                {tallyStatus.errorMessage}
              </div>
            )}
          </div>
        </div>

        {/* API Status */}
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${getStatusColor(
              apiStatus?.isOnline
            )}`}
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">API</div>
            <div className="text-xs text-muted-foreground">
              {apiStatus?.isOnline ? "Online" : "Offline"}
              {apiStatus?.responseTime && ` (${apiStatus.responseTime}ms)`}
            </div>
            {apiStatus?.lastCheckTime && (
              <div className="text-xs text-muted-foreground">
                Last check: {formatTime(apiStatus.lastCheckTime)}
              </div>
            )}
            {apiStatus?.errorMessage && !apiStatus.isOnline && (
              <div className="text-xs text-red-500 mt-1">
                {apiStatus.errorMessage}
              </div>
            )}
          </div>
        </div>

        {/* Sync Status */}
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${getSyncStatusColor(
              syncStatus?.status
            )}`}
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">Sync</div>
            <div className="text-xs text-muted-foreground">
              {syncStatus?.isRunning
                ? "Running"
                : syncStatus?.status === "error"
                ? "Error"
                : "Idle"}
            </div>
            {syncStatus?.lastSyncTime && (
              <div className="text-xs text-muted-foreground">
                Last sync: {formatTime(syncStatus.lastSyncTime)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
