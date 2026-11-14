import * as songApi from "../../api/client";
import { createRemoteSongRepository } from "./RemoteSongRepository";

export const remoteSongRepository = createRemoteSongRepository(songApi);
