import type { UserRole } from '../../types';

type UserRoleBadgeProps = {
  role: UserRole;
  className?: string;
};

const roleClasses: Record<UserRole, string> = {
  SuperAdmin: 'border-rose-300 bg-rose-50 text-rose-700',
  Admin: 'border-cyan-300 bg-cyan-50 text-cyan-700',
  Moderator: 'border-amber-300 bg-amber-50 text-amber-700',
  Member: 'border-slate-300 bg-slate-50 text-slate-600',
};

const UserRoleBadge = ({ role, className = '' }: UserRoleBadgeProps) => {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        roleClasses[role],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {role}
    </span>
  );
};

export default UserRoleBadge;
