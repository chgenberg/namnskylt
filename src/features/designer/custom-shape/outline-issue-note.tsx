import { CUSTOM_OUTLINE_ISSUE_TEXT, type CustomOutlineIssue } from "@/engine";
import styles from "./custom-shape.module.css";

/** Vad kunden behöver göra för att formen ska gå att skära. */
const ISSUE_FIX: Record<CustomOutlineIssue, string> = {
  points: "Lägg till eller ta bort punkter tills antalet stämmer.",
  outside: "Dra in punkterna innanför den streckade rutan, eller gör skylten större under Mått.",
  "short-edge":
    "Två punkter ligger för nära varandra; kanten är rödmarkerad. Dra isär dem, ta bort den ena eller gör skylten större.",
  crossing: "De rödmarkerade kanterna korsar varandra. Flytta en av punkterna så att konturen går runt formen utan att korsa sig själv.",
  area: "Dra ut punkterna så att formen blir större, eller öka måttet.",
};

interface OutlineIssueNoteProps {
  issue: CustomOutlineIssue;
}

export function OutlineIssueNote({ issue }: OutlineIssueNoteProps) {
  return (
    <div className={styles.issue} role="alert">
      <svg className={styles.issueIcon} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 3 2.5 16.5h15L10 3Z" />
        <path d="M10 8.5v3.5M10 14.2v.3" />
      </svg>
      <p>
        <strong>{CUSTOM_OUTLINE_ISSUE_TEXT[issue]}.</strong> {ISSUE_FIX[issue]} Skylten går inte att beställa förrän formen är rättad.
      </p>
    </div>
  );
}
