"""Grasshopper Script Instance"""
import System
import Rhino
import Grasshopper

import rhinoscriptsyntax as rs

import data_class
import graph_class
import JsonHelper

class DataCompiler(Grasshopper.Kernel.GH_ScriptInstance):
    def RunScript(self, graphSelection, dataCollection: list[object]):

        structuredData = []

        graph = graph_class(graphSelection)
        structuredData.append(graph)

        for d in dataCollection:
            data = data_class.from_bytes(d)
            formattedData = data_class.format_data(data, graphSelection)
            structuredData.append(formattedData)

        dataJson = JsonHelper.serialize(structuredData)

        return dataJson
