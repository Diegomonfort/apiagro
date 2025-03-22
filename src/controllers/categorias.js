const supabase = require('../config/supabase');


const getCategories = async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('categorias') 
        .select('*');
  
      if (error) {
        throw error;
      }
      res.json(data);
    } catch (error) {
      console.error('Error al obtener las categorias:', error);
      res.status(500).json({ error: 'Error al obtener las categorias.' });
    }
};
  
  
const deleteCategories = async (req, res) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
        .from('categorias')
        .delete()
        .eq('id', id);

        if (error) {
        throw error;
        }

        res.status(200).json({ message: 'Categoria eliminada correctamente' });
    } catch (error) {
        console.error('Error al eliminar el categoria:', error);
        res.status(500).json({ error: 'Error al eliminar el categoria.' });
    }
};


const updateCategory = async (req, res) => {
    const { id } = req.params;
    const {
        Nombre,
    } = req.body;

    try {
        // Prepara los datos para la actualización solo con los campos existentes
        const updateData = {
            ...(Nombre && { Nombre }),
        };

        // Si hay una nueva imagen, súbela a Supabase y agrégala a `updateData`
        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname}`;
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('categoriesFotos')
                .upload(`categorias/${fileName}`, req.file.buffer, {
                    contentType: req.file.mimetype,
                    cacheControl: '3600',
                    upsert: true,
                });

            if (uploadError) {
                console.error('Error al subir la imagen:', uploadError.message);
                return res.status(500).json({ error: 'Error al subir la imagen al bucket.' });
            }

            // Obtén la URL pública de la imagen
            const { data: publicUrlData, error: publicUrlError } = supabase
                .storage
                .from('categoriesFotos')
                .getPublicUrl(`categorias/${fileName}`);

            if (publicUrlError) {
                console.error('Error al obtener la URL pública:', publicUrlError.message);
                return res.status(500).json({ error: 'Error al generar la URL pública de la imagen.' });
            }

            // Agrega la URL de la imagen al objeto de datos a actualizar
            updateData.imagen = publicUrlData.publicUrl;
        }

        // Actualiza el producto en la base de datos
        const { data, error } = await supabase
            .from('categorias')
            .update(updateData)
            .eq('id', id);

        if (error) {
            console.error('Error al actualizar la base de datos:', error.message);
            return res.status(500).json({ error: 'Error al actualizar el producto en la base de datos.' });
        }

        res.status(200).json({ message: 'Producto actualizado correctamente', data });
    } catch (error) {
        console.error('Error general:', error.message);
        res.status(500).json({ error: 'Error al actualizar el producto.' });
    }
};

module.exports = {
    getCategories,
    deleteCategories,
    updateCategory
};
