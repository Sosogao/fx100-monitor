import { ExternalLink } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

interface ResearchInfoProps {
  businessMeaning?: string;
  riskControlled?: string;
  formula?: string;
  runtimeStatus?: string;
  testStatus?: string;
  docHref?: string;
  sectionMeaning?: string;
  sectionRuntime?: string;
}

function rows(props: ResearchInfoProps) {
  return [
    props.businessMeaning ? { label: "Meaning", value: props.businessMeaning } : null,
    props.riskControlled ? { label: "Risk", value: props.riskControlled } : null,
    props.formula ? { label: "Formula", value: props.formula } : null,
    props.runtimeStatus ? { label: "Runtime", value: props.runtimeStatus } : null,
    props.testStatus ? { label: "Tests", value: props.testStatus } : null,
    props.sectionMeaning ? { label: "Meaning", value: props.sectionMeaning } : null,
    props.sectionRuntime ? { label: "Runtime", value: props.sectionRuntime } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
}

export function ResearchInfo(props: ResearchInfoProps) {
  const items = rows(props);
  if (!items.length && !props.docHref) return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      <HoverCard openDelay={120}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="rounded border border-primary/30 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-primary hover:bg-primary/10"
          >
            Explain
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-[28rem] space-y-2 text-xs">
          {items.map((item) => (
            <div key={`${item.label}:${item.value.slice(0, 24)}`} className="break-words">
              <span className="font-semibold text-foreground">{item.label}:</span> {item.value}
            </div>
          ))}
          {props.docHref ? (
            <a
              href={props.docHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Open docs <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </HoverCardContent>
      </HoverCard>
      {props.docHref ? (
        <a
          href={props.docHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
        >
          Docs <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}
