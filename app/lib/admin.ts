export const ADMIN_EMAIL = "pryeralex492@gmail.com";
export const isAdmin = (email?: string | null) =>
  email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
