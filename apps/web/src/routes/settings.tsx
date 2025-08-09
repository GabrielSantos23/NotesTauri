import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Clipboard,
  Shield,
  Palette,
  Info,
  ArrowLeft,
  Download,
  RefreshCw,
} from "lucide-react";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState<string>("");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [autoCopyEnabled, setAutoCopyEnabled] = useState<boolean>(true);
  const [persistenceEnabled, setPersistenceEnabled] = useState<boolean>(true);

  useEffect(() => {
    // Try to load version from Tauri API; ignore errors if running in pure web
    getVersion()
      .then(setAppVersion)
      .catch(() => {
        setAppVersion("");
      });
    // Load initial toggle states from backend
    invoke<boolean>("get_clipboard_monitoring_enabled")
      .then((v) => setAutoCopyEnabled(v))
      .catch(() => {});
    invoke<boolean>("get_persistence_enabled")
      .then((v) => setPersistenceEnabled(v))
      .catch(() => {});
  }, []);

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const update = await checkForUpdate();

      if (!update || !update.available) {
        toast.info("You're up to date");
        return;
      }

      toast.message("Update available", {
        description: `v${update.currentVersion} → v${update.version}`,
      });

      await update.downloadAndInstall();
      toast.success("Update downloaded. Restarting...");
      // On Windows NSIS, the installer will handle restart after install
    } catch (error: any) {
      toast.error("Failed to check/install updates");
      console.error(error);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto min-h-full">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Settings</h1>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/" })}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Notes
          </Button>
        </div>

        <div className="border-none px-5 rounded-xl bg-card/80 shadow-sm">
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-lg font-semibold">Clipboard</div>
                <div className="text-muted-foreground text-sm">
                  Control how the app handles clipboard content
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4 px-6 pb-6">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card/50">
              <div className="space-y-1">
                <h3 className="font-medium">Auto-copy from clipboard</h3>
                <p className="text-sm text-muted-foreground">
                  Automatically detect and import content from your clipboard
                </p>
              </div>
              <Switch
                checked={autoCopyEnabled}
                onCheckedChange={async (checked) => {
                  setAutoCopyEnabled(checked);
                  try {
                    await invoke("set_clipboard_monitoring_enabled", {
                      enabled: checked,
                    });
                  } catch {}
                }}
              />
            </div>

            {/* Removed redundant Clipboard monitoring toggle */}
          </div>
        </div>

        <div className="rounded-xl bg-card/80 shadow-sm">
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-lg font-semibold">Privacy & Security</div>
                <div className="text-muted-foreground text-sm">
                  Manage your data and privacy settings
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4 px-6 pb-6">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card/50">
              <div className="space-y-1">
                <h3 className="font-medium">Local storage only</h3>
                <p className="text-sm text-muted-foreground">
                  Keep all data stored locally on your device
                </p>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card/50">
              <div className="space-y-1">
                <h3 className="font-medium">Analytics</h3>
                <p className="text-sm text-muted-foreground">
                  Help improve the app by sharing anonymous usage data
                </p>
              </div>
              <Switch />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-card/80 shadow-sm">
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-lg font-semibold">Persistence</div>
                <div className="text-muted-foreground text-sm">
                  Control whether clipboard history is saved across restarts
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4 px-6 pb-6">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card/50">
              <div className="space-y-1">
                <h3 className="font-medium">Enable persistence</h3>
                <p className="text-sm text-muted-foreground">
                  Save the last entries to disk and restore them on launch
                </p>
              </div>
              <Switch
                checked={persistenceEnabled}
                onCheckedChange={async (checked) => {
                  setPersistenceEnabled(checked);
                  try {
                    await invoke("set_persistence_enabled", {
                      enabled: checked,
                    });
                  } catch {}
                }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-card/80 shadow-sm">
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-lg font-semibold">About</div>
                <div className="text-muted-foreground text-sm">
                  Information about the app and version
                </div>
              </div>
            </div>
          </div>
          <div className="px-6 pb-6">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Version</span>
                <span>{appVersion || "—"}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Updates</span>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={handleCheckUpdates}
                  disabled={isCheckingUpdate}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isCheckingUpdate ? "animate-spin" : ""}`}
                  />
                  {isCheckingUpdate ? "Checking..." : "Check for updates"}
                </Button>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform</span>
                <span>Tauri</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
