"""Grasshopper Script Instance"""
import System
import Rhino
import Grasshopper

import rhinoscriptsyntax as rs
import data_class

class DataConstructor(Grasshopper.Kernel.GH_ScriptInstance):
    def RunScript(self, name, parent, value, dataType, description, tags: list[object]):
        data = data_class(name, parent, value, dataType, description, tags)
        byte = bytes(data)
        return byte