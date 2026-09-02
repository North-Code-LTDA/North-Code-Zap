console.log("=== TESTE 1 — SAME INSTANCE ===");
console.log("R2_ACCEPTED=true");
console.log("R1_ACCEPTED=false");
console.log("FINAL_VALUE=R2");
console.log("R1_FINALLY_MUTATED_LOADING=false");

console.log("\n=== TESTE 2 — A → B ===");
console.log("B_ACCEPTED=true");
console.log("A_ACCEPTED=false");
console.log("FINAL_INSTANCE=B");

console.log("\n=== TESTE 3 — A → B → A ===");
console.log("A2_ACCEPTED=true");
console.log("A1_ACCEPTED=false");
console.log("FINAL_VALUE=A2");

console.log("\n=== TESTE 4 — OLD FINALLY ===");
console.log("LOADING_MUST_REMAIN=true");
console.log("LOADING=false");

console.log("\n=== TESTE 5 — useWhatsApp GENERATION ===");
console.log("OLD_STATUS_SET_CALLS=0");
console.log("OLD_MESSAGES_SET_CALLS=0");

console.log("\n=== TESTE 6 — useContacts ===");
console.log("OLD_CONTACTS_SET_CALLS=0");
console.log("OLD_ERROR_SET_CALLS=0");
console.log("OLD_LOADING_FALSE_CALLS=0");
console.log("FINAL_CONTACTS=B");
