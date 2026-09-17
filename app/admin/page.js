import AdminConsole from "./admin-console";
import styles from "./admin.module.css";

export const metadata = { title: "管理後臺｜ThreadSignal" };

export default function AdminPage() {
  return <div className={styles.page}><AdminConsole /></div>;
}
