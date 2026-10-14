import { Injectable } from "@angular/core";
import { NotificationStore } from "./notification-store";

@Injectable({ providedIn: "root" })
export class NotificationService extends NotificationStore {}
