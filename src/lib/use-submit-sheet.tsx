import * as React from "react";

type SubmitSheetCtx = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const Ctx = React.createContext<SubmitSheetCtx | null>(null);

export function SubmitSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

export function useSubmitSheet(): SubmitSheetCtx {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useSubmitSheet must be used inside SubmitSheetProvider");
  return v;
}
