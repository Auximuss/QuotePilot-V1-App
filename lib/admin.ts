export const ADMIN_EMAIL = "aux6998@gmail.com";
export const isAdmin = (email?: string | null) =>
  email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
