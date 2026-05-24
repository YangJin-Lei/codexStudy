import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CODEXSTUDY_GITHUB_URL } from "@/codexStudyRepo";

export function AboutView() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchVersion = async () => {
      try {
        const value = await getVersion();
        if (active) {
          setVersion(value);
        }
      } catch {
        if (active) {
          setVersion(null);
        }
      }
    };

    void fetchVersion();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="about">
      <div className="about-card">
        <div className="about-header">
          <img className="about-icon" src="/app-icon.png" alt="CodexStudy icon" />
          <div className="about-title">CodexStudy</div>
        </div>
        <div className="about-version">
          {version ? `Version ${version}` : "Version unavailable"}
        </div>
        <div className="about-tagline">
          A native desktop app for working with CodexStudy across your local projects.
        </div>
        <div className="about-divider" />
        <div className="about-links">
          <button
            type="button"
            className="about-link"
            onClick={() => {
              void openUrl(CODEXSTUDY_GITHUB_URL);
            }}
          >
            GitHub
          </button>
        </div>
        <div className="about-footer">Built for local CodexStudy work.</div>
      </div>
    </div>
  );
}
