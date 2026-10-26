"use client";

import React, { createContext, useContext } from "react";
import { specialistsData, type Specialist } from "@/data/specialists";

/**
 * The team the console publishes, available to any client card that names a doctor.
 *
 * An article's byline is a doctor's name, and that name is editable; a list or card
 * deep in the tree should not have to carry the whole team through its props to find
 * it. The snapshot is the value when nothing published — the same fallback the page
 * readers use.
 */
const SpecialistsContext = createContext<Specialist[]>(specialistsData);

export const SpecialistsProvider: React.FC<{ children: React.ReactNode; specialists: Specialist[] }> = ({
  children,
  specialists,
}) => <SpecialistsContext.Provider value={specialists}>{children}</SpecialistsContext.Provider>;

export const useSpecialist = (id: string | undefined): Specialist | undefined => {
  const specialists = useContext(SpecialistsContext);
  return id ? specialists.find((specialist) => specialist.id === id) : undefined;
};
