import { ARENAS } from "@arena/sim";
import { useEffect, useState } from "react";
import { api, type CommunityMapListItem } from "../session/api";

export function MapSelect(props: {
  value: string;
  onChange: (mapId: string) => void;
  apiOnline: boolean;
  disabled?: boolean;
  /** Nome quando o id ainda não está na lista (mapa aplicado na sala). */
  fallbackName?: string;
}) {
  const [community, setCommunity] = useState<CommunityMapListItem[]>([]);
  useEffect(() => {
    if (!props.apiOnline) return;
    api.listMaps().then((r) => setCommunity(r.maps)).catch(() => undefined);
  }, [props.apiOnline]);

  const known = Object.values(ARENAS).some((a) => a.id === props.value) || community.some((m) => m.id === props.value);

  return (
    <select className="input py-1.5 text-sm" value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value)}>
      {!known && props.value && <option value={props.value}>{props.fallbackName || props.value}</option>}
      <optgroup label="Oficiais">
        {Object.values(ARENAS).map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </optgroup>
      {community.length > 0 && (
        <optgroup label="Comunidade">
          {community.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.authorName}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
