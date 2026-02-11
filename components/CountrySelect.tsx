const COUNTRIES = [
  "Türkiye",
  "Almanya",
  "Amerika Birleşik Devletleri",
  "Birleşik Krallık",
  "Çin",
  "Japonya",
  "Güney Kore",
  "Hindistan",
  "Fransa",
  "İtalya",
  "İspanya",
  "Hollanda",
  "Belçika",
  "Polonya",
  "Rusya",
  "Kanada",
  "Meksika",
  "Brezilya",
  "Arjantin",
  "Avustralya",
  "Birleşik Arap Emirlikleri",
  "Suudi Arabistan",
  "İsviçre",
  "İsveç",
  "Norveç",
  "Finlandiya",
  "Danimarka",
  "Çekya",
  "Macaristan",
  "Romanya",
  "Bulgaristan",
  "Yunanistan",
  "Portekiz",
  "İrlanda",
  "Mısır",
  "Güney Afrika",
  "Nijerya",
  "Kenya",
  "Endonezya",
  "Malezya",
  "Tayland",
  "Vietnam",
  "Tayvan",
  "Singapur",
];

type Props = {
  name: string;
  defaultValue?: string | null;
  className?: string;
  listId?: string;
  placeholder?: string;
};

export default function CountrySelect({
  name,
  defaultValue,
  className,
  listId = "country-options",
  placeholder = "Ülke seç",
}: Props) {
  return (
    <>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        list={listId}
        placeholder={placeholder}
        className={className ?? "mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"}
        autoComplete="off"
      />
      <datalist id={listId}>
        {COUNTRIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
