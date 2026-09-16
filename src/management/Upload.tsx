import { useEffect, useState } from "react";
import { client, errorMessage, apiUrl, publishableKey } from "./client";
import type { Notify } from "./types";
export function Upload({
  school,
  student,
  notify,
}: {
  school: string;
  student?: string;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="field">
      <span>{student ? "Foto do aluno" : "Logotipo da instituição"}</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 2097152) {
            notify("Envie uma imagem de até 2 MB.", true);
            return;
          }
          setBusy(true);
          try {
            const { data } = await client.auth.getSession();
            const response = await fetch(`${apiUrl}/functions/v1/af-upload`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${data.session?.access_token}`,
                apikey: publishableKey,
                "Content-Type": file.type,
                "x-school-id": school,
                ...(student ? { "x-student-id": student } : {}),
              },
              body: file,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            notify("Imagem salva.");
          } catch (e) {
            notify(errorMessage(e), true);
          } finally {
            setBusy(false);
          }
        }}
      />
      <small>{busy ? "Enviando…" : "PNG, JPEG ou WebP. Máximo de 2 MB."}</small>
    </label>
  );
}

export function MediaImage({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    if (!path) return;
    if (path.startsWith("https://")) {
      if (new URL(path).hostname.endsWith(".supabase.co")) setUrl(path);
      return;
    }
    client.storage
      .from("af-media")
      .createSignedUrl(path, 300)
      .then(({ data, error }) => {
        if (active && !error && data) setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [path]);
  return url ? <img className="media-image" src={url} alt={alt} /> : null;
}
