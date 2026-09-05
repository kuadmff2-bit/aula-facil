import { Monitor, Moon, Sun } from "lucide-react";

export type AppearanceMode = "system" | "light" | "dark";

export function AppearanceSettings({ value, onChange }: { value: AppearanceMode; onChange: (value: AppearanceMode) => void }) {
  const options: Array<{ id: AppearanceMode; label: string; description: string; icon: typeof Sun }> = [
    { id: "system", label: "Seguir o Windows", description: "Acompanha automaticamente o tema do computador.", icon: Monitor },
    { id: "light", label: "Claro", description: "Interface clara para ambientes iluminados.", icon: Sun },
    { id: "dark", label: "Escuro", description: "Interface escura com contraste confortável.", icon: Moon },
  ];

  return (
    <section className="card appearance-settings">
      <div className="section-heading">
        <div>
          <h2>Aparência</h2>
          <p>Escolha como o AulaFácil deve aparecer neste dispositivo.</p>
        </div>
      </div>
      <div className="appearance-options">
        {options.map(({ id, label, description, icon: Icon }) => (
          <button key={id} type="button" className={value === id ? "appearance-option active" : "appearance-option"} onClick={() => onChange(id)}>
            <span><Icon size={21} /></span>
            <div><strong>{label}</strong><small>{description}</small></div>
            <i aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
