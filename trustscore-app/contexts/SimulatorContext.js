import { createContext, useContext, useState } from "react";

const SimulatorContext = createContext(null);

export function SimulatorProvider({ children }) {
  const [simulatorDraft, setSimulatorDraft] = useState(null);

  function clearSimulatorDraft() {
    setSimulatorDraft(null);
  }

  return (
    <SimulatorContext.Provider
      value={{
        simulatorDraft,
        setSimulatorDraft,
        clearSimulatorDraft,
      }}
    >
      {children}
    </SimulatorContext.Provider>
  );
}

export function useSimulator() {
  const context = useContext(SimulatorContext);

  if (!context) {
    throw new Error(
      "useSimulator must be used inside SimulatorProvider"
    );
  }

  return context;
}