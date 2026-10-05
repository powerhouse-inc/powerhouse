/**
 * Not listed in any config. If a command ever discovers definition roots by
 * scanning a directory instead of reading the declared list, this module is
 * imported and the run fails here, loudly, instead of quietly changing which
 * definitions a package ships.
 */
throw new Error("the decoy source was imported");
