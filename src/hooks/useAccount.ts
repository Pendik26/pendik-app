import { useContext } from "react";
import { AccountContext, type AccountContextValue } from "../context/accountContextValue";

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider");
  return ctx;
}
