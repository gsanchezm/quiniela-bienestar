export interface AvatarUser {
  nombre: string;
  apellido: string;
  photo: string | null;
  color: string;
}

export function Avatar({ user, size = 34 }: { user: AvatarUser; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (user.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={user.photo} alt="" style={style} />;
  }
  const initials = `${user.nombre[0] ?? ''}${user.apellido[0] ?? ''}`;
  return (
    <span className="avatar avatar-initials" style={{ ...style, background: user.color }}>
      {initials}
    </span>
  );
}
