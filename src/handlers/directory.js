const DIRECTORY_COLUMNS = "id, display_name, email, department, role";

function listColleagues(db) {
  return db.prepare(`SELECT ${DIRECTORY_COLUMNS} FROM users ORDER BY display_name`).all();
}

export function searchDirectory(db, q) {
  const sql =
    "SELECT id, display_name, email, department, role FROM users " +
    "WHERE display_name LIKE ? OR department LIKE ?";

  const term = "%" + q + "%";
  return db.prepare(sql).all(term, term);
}

/** GET /directory */
export function showDirectory(req, res) {
  const db = req.app.locals.db;
  const q = typeof req.query.q === "string" ? req.query.q : "";

  const colleagues = q ? searchDirectory(db, q) : listColleagues(db);

  res.render("directory/index", { q, colleagues });
}
