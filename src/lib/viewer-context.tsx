"use client";

import { createContext, useContext } from "react";

export const ViewerContext = createContext(false);

export function useIsViewer(): boolean {
  return useContext(ViewerContext);
}
